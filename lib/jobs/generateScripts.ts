// Batch script generation (I/O orchestration). For the most recent scoring
// run, take the top-N leads, gather their context, and have Claude write the
// per-lead outreach package — persisted to lead_scripts, with motivation /
// pain_points written back onto lead_scores. Invoked by the nightly cron
// after scoring (see app/api/scripts/route.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { createAnthropic } from '@/lib/anthropic/client'
import { generateScripts, type LeadContext } from '@/lib/ai/scripts'

type Db = ReturnType<typeof createAdminClient>

export interface ScriptRunResult {
  runDate: string | null
  generated: number
  errors: number
}

// Format a lead_event row into a short human-readable line for the prompt.
function describeEvent(type: string, payload: Record<string, unknown> | null, at: string): string {
  const day = at.slice(0, 10)
  const p = payload ?? {}
  switch (type) {
    case 'property_view': return `Viewed a property (${day})`
    case 'saved_property': return `Saved a property (${day})`
    case 'inquiry': return `Submitted an inquiry${p.message ? `: "${String(p.message).slice(0, 80)}"` : ''} (${day})`
    case 'website_visit': return `Visited the website (${day})`
    case 'text_in': return `Texted us${p.body ? `: "${String(p.body).slice(0, 80)}"` : ''} (${day})`
    case 'text_out': return `We texted them (${day})`
    case 'call': return `${p.direction === 'inbound' ? 'Inbound' : 'Outbound'} call${p.outcome ? ` — ${p.outcome}` : ''} (${day})`
    case 'note': return `Note${p.body ? `: "${String(p.body).slice(0, 80)}"` : ''} (${day})`
    case 'email_open': return `Opened an email (${day})`
    case 'email_click': return `Clicked an email link (${day})`
    default: return `${type} (${day})`
  }
}

// Run `tasks` with a bounded number in flight at once.
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return results
}

export async function generateScriptsForRun(limitArg?: number): Promise<ScriptRunResult> {
  const db = createAdminClient()
  const anth = createAnthropic()

  // Latest scoring run.
  const { data: latest } = await db
    .from('lead_scores').select('run_date').order('run_date', { ascending: false }).limit(1).maybeSingle()
  const runDate = latest?.run_date as string | undefined
  if (!runDate) return { runDate: null, generated: 0, errors: 0 }

  // How many to generate (default from settings.top_n).
  let limit = limitArg
  if (limit == null) {
    const { data: settings } = await db.from('settings').select('top_n').eq('id', true).maybeSingle()
    limit = (settings?.top_n as number | undefined) ?? 15
  }

  // Top-N scored leads for the run, with the lead fields we need for context.
  const { data: top, error } = await db
    .from('lead_scores')
    .select('lead_id, score, timeline_bucket, best_contact_window, overdue_detail, reasons, leads(name, lead_type, stage, city, tags)')
    .eq('run_date', runDate)
    .order('score', { ascending: false })
    .limit(limit)
  if (error) throw new Error('load top scores: ' + error.message)
  const rows = (top ?? []) as unknown as ScoreRow[]
  if (!rows.length) return { runDate, generated: 0, errors: 0 }

  // Recent events for just these leads, newest first, grouped in memory.
  const ids = rows.map((r) => r.lead_id)
  const { data: events } = await db
    .from('lead_events').select('lead_id, type, occurred_at, payload')
    .in('lead_id', ids).order('occurred_at', { ascending: false })
  const byLead = new Map<number, string[]>()
  for (const e of (events ?? []) as EventRow[]) {
    const arr = byLead.get(e.lead_id) ?? []
    if (arr.length < 8) arr.push(describeEvent(e.type, e.payload, e.occurred_at))
    byLead.set(e.lead_id, arr)
  }

  let errors = 0
  const outcomes = await pool(rows, 4, async (row) => {
    const lead = row.leads
    const ctx: LeadContext = {
      name: lead?.name || `Lead #${row.lead_id}`,
      lead_type: lead?.lead_type ?? null,
      stage: lead?.stage ?? null,
      city: lead?.city ?? null,
      tags: Array.isArray(lead?.tags) ? (lead!.tags as string[]) : [],
      score: row.score,
      timeline_bucket: row.timeline_bucket ?? 'unknown',
      best_contact_window: row.best_contact_window,
      overdue_detail: row.overdue_detail,
      reasons: Array.isArray(row.reasons) ? row.reasons : [],
      recent_activity: byLead.get(row.lead_id) ?? [],
    }
    try {
      const bundle = await generateScripts(anth, ctx)
      const { error: scriptErr } = await db.from('lead_scripts').upsert({
        lead_id: row.lead_id,
        run_date: runDate,
        call_script: { framework: bundle.scripts.call_framework },
        text_script: bundle.scripts.text,
        voicemail: bundle.scripts.voicemail,
        email_subject: bundle.scripts.email_subject,
        email_body: bundle.scripts.email_body,
        objections: bundle.scripts.objections,
      }, { onConflict: 'lead_id,run_date' })
      if (scriptErr) throw new Error(scriptErr.message)
      await db.from('lead_scores')
        .update({ motivation: bundle.motivation, pain_points: bundle.pain_points })
        .eq('lead_id', row.lead_id).eq('run_date', runDate)
      return true
    } catch (e) {
      console.error(`[scripts] lead ${row.lead_id} failed:`, (e as Error).message)
      errors++
      return false
    }
  })

  return { runDate, generated: outcomes.filter(Boolean).length, errors }
}

interface ScoreRow {
  lead_id: number
  score: number
  timeline_bucket: string | null
  best_contact_window: string | null
  overdue_detail: string | null
  reasons: string[] | null
  leads: { name: string | null; lead_type: 'buyer' | 'seller' | null; stage: string | null; city: string | null; tags: unknown } | null
}
interface EventRow {
  lead_id: number
  type: string
  occurred_at: string
  payload: Record<string, unknown> | null
}
