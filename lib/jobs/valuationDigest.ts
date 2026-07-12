// The "Deal Radar" section of the team digest email: what the valuation
// pipeline did in the last 24h and what needs a human. Returns an HTML
// snippet that sendDigest drops into the daily briefing (empty string when
// there's nothing to show, so digests stay clean pre-launch).

import { createAdminClient } from '@/lib/supabase/admin'
import { usageSummary } from '@/lib/rentcast/budget'
import { formatMoney } from '@/lib/valuation/range'

type Db = ReturnType<typeof createAdminClient>

interface RadarRow {
  token: string
  status: string
  hold_reason: string | null
  address_formatted: string | null
  value_low: number | null
  value_high: number | null
  zillow_url: string | null
  listing: { office?: string; price?: number } | null
  created_at: string
  sent_at: string | null
  leads: { name: string | null } | null
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fubUrl = (id: number) => `https://app.followupboss.com/2/people/view/${id}`

function row(label: string, html: string): string {
  return `<div style="padding:8px 0;border-top:1px solid #f3f4f6;font-size:13px;color:#374151;">
    <span style="display:inline-block;min-width:74px;padding:1px 6px;margin-right:6px;border-radius:4px;background:#eef3f8;color:#2c496a;font-size:10px;font-weight:700;letter-spacing:.3px;text-align:center;">${label}</span>
    ${html}
  </div>`
}

export async function buildDealRadarHtml(db: Db): Promise<string> {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString()

  const [{ data: recent }, { data: needsAddr }] = await Promise.all([
    db.from('valuation_reports')
      .select('token, status, hold_reason, address_formatted, value_low, value_high, zillow_url, listing, created_at, sent_at, lead_id, leads(name)')
      .gte('created_at', since).neq('hold_reason', 'needs_address')
      .order('created_at', { ascending: false }).limit(20),
    db.from('valuation_reports')
      .select('lead_id, leads(name)')
      .eq('hold_reason', 'needs_address').eq('status', 'skipped')
      .order('created_at', { ascending: false }).limit(10),
  ])

  const rows = (recent ?? []) as unknown as (RadarRow & { lead_id: number })[]
  const missing = (needsAddr ?? []) as unknown as { lead_id: number; leads: { name: string | null } | null }[]
  if (!rows.length && !missing.length) return ''

  const parts: string[] = []
  for (const r of rows) {
    const name = esc(r.leads?.name || `Lead #${r.lead_id}`)
    const addr = esc(r.address_formatted ?? 'address unknown')
    const range = r.value_low != null && r.value_high != null
      ? `${formatMoney(r.value_low)}–${formatMoney(r.value_high)}` : '—'
    const links = [
      `<a href="${base}/r/${r.token}" style="color:#196f97;">report</a>`,
      r.zillow_url ? `<a href="${esc(r.zillow_url)}" style="color:#196f97;">Zillow</a>` : '',
      `<a href="${fubUrl(r.lead_id)}" style="color:#196f97;">FUB</a>`,
    ].filter(Boolean).join(' · ')

    if (r.status === 'sent') {
      parts.push(row('SENT', `<b>${name}</b> — ${addr} · ${range} · ${links}`))
    } else if (r.hold_reason === 'listed_elsewhere') {
      const office = r.listing?.office ? ` with ${esc(r.listing.office)}` : ''
      const price = r.listing?.price ? ` at ${formatMoney(r.listing.price)}` : ''
      parts.push(row('LISTED', `<b>${name}</b> — ${addr} is already on the market${office}${price}. Not emailed. Match to buyers? ${links}`))
    } else if (r.status === 'held') {
      const why = r.hold_reason === 'thin_data' ? 'thin comp data'
        : r.hold_reason === 'no_email' ? 'no email on file'
          : r.hold_reason === 'address_only' ? 'no seller tag — review before sending'
            : 'needs review'
      parts.push(row('REVIEW', `<b>${name}</b> — ${addr} · ${range} · ${why} · <a href="${base}/admin/valuations" style="color:#196f97;">approve</a> · ${links}`))
    } else if (r.status === 'failed') {
      parts.push(row('FAILED', `<b>${name}</b> — ${addr} · generation failed, see <a href="${base}/admin/valuations" style="color:#196f97;">admin</a>`))
    }
  }

  if (missing.length) {
    const names = missing
      .map((m) => `<a href="${fubUrl(m.lead_id)}" style="color:#196f97;">${esc(m.leads?.name || `Lead #${m.lead_id}`)}</a>`)
      .join(', ')
    parts.push(row('NO ADDR', `Sellers missing a home address (add it in FUB and the next run values them): ${names}`))
  }

  const usage = await usageSummary(db)
  return `
    <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;">
      <h2 style="margin:0 0 2px;font-size:17px;color:#0f2a43;font-family:Georgia,serif;">Deal Radar — home valuations</h2>
      <div style="color:#9ca3af;font-size:12px;margin-bottom:6px;">Automated value reports · RentCast usage ${usage.used}/${usage.budget} this month</div>
      ${parts.join('')}
    </div>`
}
