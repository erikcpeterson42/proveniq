// Daily digest email (I/O). Builds an HTML briefing of the top-N leads from
// the latest scoring run and sends it via Resend to the configured
// recipients. Invoked by the nightly cron after scoring + script generation.

import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildDealRadarHtml } from './valuationDigest'

type Db = ReturnType<typeof createAdminClient>

export interface DigestResult {
  runDate: string | null
  sent: boolean
  recipients: string[]
  leadCount: number
  skipped?: string
}

interface DigestRow {
  lead_id: number
  score: number
  timeline_bucket: string | null
  next_action: string | null
  is_hot: boolean
  is_gem: boolean
  is_overdue: boolean
  leads: { name: string | null; lead_type: 'buyer' | 'seller' | null; city: string | null } | null
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function recipientList(db: Db): Promise<string[]> {
  const { data: settings } = await db.from('settings').select('digest_recipients').eq('id', true).maybeSingle()
  const configured = (settings?.digest_recipients as string[] | undefined) ?? []
  if (configured.length) return configured
  // Fallback: every team member's email.
  const { data: profiles } = await db.from('profiles').select('email')
  return (profiles ?? []).map((p) => p.email as string).filter(Boolean)
}

function buildHtml(runDate: string, rows: DigestRow[], stats: { hot: number; gems: number; overdue: number }, dealRadarHtml: string): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const chip = (bg: string, fg: string, label: string) =>
    `<span style="display:inline-block;padding:1px 6px;margin-left:4px;border-radius:4px;background:${bg};color:${fg};font-size:10px;font-weight:700;letter-spacing:.3px;">${label}</span>`

  const items = rows.map((r, i) => {
    const lead = r.leads
    const name = esc(lead?.name || `Lead #${r.lead_id}`)
    const badges =
      (lead?.lead_type ? chip('#dcfce7', '#15803d', lead.lead_type.toUpperCase()) : '') +
      (r.is_hot ? chip('#fee2e2', '#b91c1c', 'HOT') : '') +
      (r.is_gem ? chip('#d8f0fb', '#196f97', 'GEM') : '') +
      (r.is_overdue ? chip('#fef0d6', '#b45309', 'OVERDUE') : '')
    return `
      <tr>
        <td style="padding:14px 0;border-top:1px solid #eee;vertical-align:top;width:34px;">
          <div style="width:26px;height:26px;border-radius:50%;background:#f3f4f6;color:#6b7280;font-weight:700;font-size:13px;text-align:center;line-height:26px;">${i + 1}</div>
        </td>
        <td style="padding:14px 0;border-top:1px solid #eee;vertical-align:top;">
          <a href="${base}/dashboard/${r.lead_id}" style="color:#0f2a43;font-weight:600;text-decoration:none;font-size:15px;">${name}</a>${badges}
          <div style="color:#374151;font-size:13px;margin-top:3px;">${esc(r.next_action ?? '')}</div>
          <div style="color:#9ca3af;font-size:12px;margin-top:2px;">${lead?.city ? esc(lead.city) + ' · ' : ''}timeline ~${esc(r.timeline_bucket ?? '?')} days</div>
        </td>
        <td style="padding:14px 0;border-top:1px solid #eee;vertical-align:top;text-align:right;width:44px;">
          <div style="font-size:20px;font-weight:700;color:#0f2a43;">${r.score}</div>
        </td>
      </tr>`
  }).join('')

  return `<!doctype html><html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;">
        <img src="${base}/proven-logo.png" alt="Proven Realty, brokered by eXp" style="height:38px;width:auto;margin-bottom:10px;" />
        <div style="font-size:12px;color:#9ca3af;">${runDate}</div>
        <h1 style="margin:2px 0 2px;font-size:22px;color:#0f2a43;font-family:Georgia,serif;">Today&rsquo;s Briefing</h1>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">The leads most worth contacting today.</p>
        <div style="font-size:13px;color:#374151;margin-bottom:8px;">
          <b style="color:#b91c1c;">${stats.hot}</b> hot &nbsp;·&nbsp;
          <b style="color:#196f97;">${stats.gems}</b> seller gems &nbsp;·&nbsp;
          <b style="color:#b45309;">${stats.overdue}</b> overdue
        </div>
        <table style="width:100%;border-collapse:collapse;">${items}</table>
        ${dealRadarHtml}
        <div style="margin-top:20px;text-align:center;">
          <a href="${base}/dashboard" style="display:inline-block;background:#0f2a43;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;">Open the full briefing</a>
        </div>
      </div>
      <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:14px;">ProvenIQ · Proven Realty lead engine</p>
    </div>
  </body></html>`
}

export async function sendDailyDigest(): Promise<DigestResult> {
  const db = createAdminClient()

  const { data: latest } = await db
    .from('lead_scores').select('run_date').order('run_date', { ascending: false }).limit(1).maybeSingle()
  const runDate = latest?.run_date as string | undefined
  if (!runDate) return { runDate: null, sent: false, recipients: [], leadCount: 0, skipped: 'no scoring run yet' }

  const { data: settings } = await db.from('settings').select('top_n').eq('id', true).maybeSingle()
  const topN = (settings?.top_n as number | undefined) ?? 15

  const [{ data: top }, hotRes, gemRes, odRes] = await Promise.all([
    db.from('lead_scores')
      .select('lead_id, score, timeline_bucket, next_action, is_hot, is_gem, is_overdue, leads(name, lead_type, city)')
      .eq('run_date', runDate).order('score', { ascending: false }).limit(topN),
    db.from('lead_scores').select('*', { count: 'exact', head: true }).eq('run_date', runDate).eq('is_hot', true),
    db.from('lead_scores').select('*', { count: 'exact', head: true }).eq('run_date', runDate).eq('is_gem', true),
    db.from('lead_scores').select('*', { count: 'exact', head: true }).eq('run_date', runDate).eq('is_overdue', true),
  ])
  const rows = (top ?? []) as unknown as DigestRow[]

  const recipients = await recipientList(db)
  if (!recipients.length) return { runDate, sent: false, recipients: [], leadCount: rows.length, skipped: 'no recipients configured' }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')
  const resend = new Resend(apiKey)
  const from = process.env.DIGEST_FROM ?? 'ProvenIQ <onboarding@resend.dev>'
  // Deal Radar section must never sink the whole digest.
  const dealRadarHtml = await buildDealRadarHtml(db).catch((e) => {
    console.error('[digest] deal radar section failed:', (e as Error).message)
    return ''
  })
  const html = buildHtml(runDate, rows, { hot: hotRes.count ?? 0, gems: gemRes.count ?? 0, overdue: odRes.count ?? 0 }, dealRadarHtml)

  const { error } = await resend.emails.send({
    from,
    to: recipients,
    subject: `ProvenIQ Briefing — ${rows.length} leads to work today (${runDate})`,
    html,
  })
  if (error) throw new Error('resend: ' + error.message)

  return { runDate, sent: true, recipients, leadCount: rows.length }
}
