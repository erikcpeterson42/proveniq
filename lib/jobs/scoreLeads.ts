// Batch scoring job (I/O orchestration — lives OUTSIDE /lib/scoring, which
// stays pure). Loads every lead + its events, runs the deterministic scorer,
// and writes one lead_scores row per lead for today's run_date. Invoked by
// the nightly cron (see app/api/score/route.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { scoreLead } from '@/lib/scoring/score'
import { bestContactWindow, nextAction } from '@/lib/scoring/derive'
import { DEFAULT_CONFIG, type ScoreConfig, type ScoringEvent } from '@/lib/scoring/types'

type Db = ReturnType<typeof createAdminClient>

interface LeadRow {
  id: number
  lead_type: 'buyer' | 'seller' | null
  stage: string | null
  tags: unknown
  last_touch_at: string | null
  last_inbound_at: string | null
  unanswered_hours: number | null
}
interface EventRow {
  lead_id: number
  type: ScoringEvent['type']
  occurred_at: string
  payload: Record<string, unknown> | null
}

export interface ScoreRunResult {
  runDate: string
  scored: number
  hot: number
  gems: number
  overdue: number
}

// Page through an entire table in 1000-row windows, ordered by id.
async function pageAll<T>(db: Db, table: string, cols: string): Promise<T[]> {
  const rows: T[] = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await db.from(table).select(cols).order('id').range(from, from + size - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    rows.push(...(data as T[]))
    if (data.length < size) break
  }
  return rows
}

function runDateUTC(now: number): string {
  return new Date(now).toISOString().slice(0, 10) // YYYY-MM-DD
}

async function loadConfig(db: Db): Promise<ScoreConfig> {
  const { data } = await db
    .from('settings')
    .select('scoring_weights, hot_touch_days, warm_touch_days')
    .eq('id', true).maybeSingle()
  const weights = (data?.scoring_weights ?? {}) as Partial<ScoreConfig>
  return {
    ...DEFAULT_CONFIG,
    ...weights,
    hotTouchDays: data?.hot_touch_days ?? DEFAULT_CONFIG.hotTouchDays,
    warmTouchDays: data?.warm_touch_days ?? DEFAULT_CONFIG.warmTouchDays,
    caps: { ...DEFAULT_CONFIG.caps, ...weights.caps },
  }
}

/**
 * Score every lead and persist a lead_scores row per lead for today. Pure
 * scoring stays in /lib/scoring; this only does the DB reads/writes and the
 * deterministic contract fields (motivation/pain_points/scripts come from the
 * later AI step).
 */
export async function scoreAllLeads(now: number = Date.now()): Promise<ScoreRunResult> {
  const db = createAdminClient()
  const runDate = runDateUTC(now)
  const cfg = await loadConfig(db)

  const leads = await pageAll<LeadRow>(db, 'leads',
    'id,lead_type,stage,tags,last_touch_at,last_inbound_at,unanswered_hours')
  const events = await pageAll<EventRow>(db, 'lead_events', 'lead_id,type,occurred_at,payload')

  // Group events by lead for O(1) lookup during scoring.
  const byLead = new Map<number, ScoringEvent[]>()
  for (const e of events) {
    const arr = byLead.get(e.lead_id) ?? []
    arr.push({ type: e.type, occurred_at: e.occurred_at, payload: e.payload })
    byLead.set(e.lead_id, arr)
  }

  let hot = 0, gems = 0, overdue = 0
  const rows = leads.map((l) => {
    const evs = byLead.get(l.id) ?? []
    const lead = {
      id: l.id,
      lead_type: l.lead_type,
      stage: l.stage,
      tags: Array.isArray(l.tags) ? (l.tags as string[]) : [],
      last_touch_at: l.last_touch_at,
      last_inbound_at: l.last_inbound_at,
      unanswered_hours: l.unanswered_hours,
    }
    const r = scoreLead(lead, evs, now, cfg)
    const isHot = r.score >= cfg.hotScore
    // A "gem" is a seller (our focus) worth acting on now that could be
    // overlooked: warm-or-better and overdue for a touch.
    const isGem = lead.lead_type === 'seller' && r.score >= cfg.warmScore && r.overdue
    if (isHot) hot++
    if (isGem) gems++
    if (r.overdue) overdue++
    return {
      lead_id: l.id,
      run_date: runDate,
      score: r.score,
      likelihood: r.likelihood_pct,
      timeline_bucket: r.timeline_bucket,
      best_contact_window: bestContactWindow(evs),
      next_action: nextAction(lead, r),
      reasons: r.reasons,
      motivation: null, // filled by the AI script step
      pain_points: [], // filled by the AI script step
      is_hot: isHot,
      is_gem: isGem,
      is_overdue: r.overdue,
      overdue_detail: r.overdue_detail,
      score_breakdown: r.breakdown,
    }
  })

  // Upsert on the (lead_id, run_date) primary key so re-running a given day
  // overwrites rather than duplicates.
  const chunk = 500
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db.from('lead_scores').upsert(rows.slice(i, i + chunk), { onConflict: 'lead_id,run_date' })
    if (error) throw new Error('lead_scores upsert: ' + error.message)
  }

  return { runDate, scored: rows.length, hot, gems, overdue }
}
