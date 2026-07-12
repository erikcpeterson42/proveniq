import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// Records that a client opened their valuation report. Fired as a beacon by
// the report page after it renders in a real browser (so email link scanners
// don't inflate the numbers). Feeds the scoring engine via lead_events:
// "they just checked their home value" is a strong motivation signal.

const DEDUPE_MINUTES = 60 // refreshes within an hour count once

export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const token = params.token
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: report } = await db
    .from('valuation_reports')
    .select('id, lead_id, status, last_opened_at, first_opened_at, open_count')
    .eq('token', token)
    .maybeSingle()
  // Only count opens on reports that actually went to a client — agents
  // previewing a held report shouldn't move the lead's score.
  if (!report || report.status !== 'sent') return NextResponse.json({ ok: true })

  const now = new Date()
  const last = report.last_opened_at ? new Date(report.last_opened_at) : null
  const isFresh = !last || now.getTime() - last.getTime() > DEDUPE_MINUTES * 60_000

  await db
    .from('valuation_reports')
    .update({
      first_opened_at: report.first_opened_at ?? now.toISOString(),
      last_opened_at: now.toISOString(),
      open_count: (report.open_count ?? 0) + (isFresh ? 1 : 0),
    })
    .eq('id', report.id)

  if (isFresh) {
    await db.from('lead_events').insert({
      lead_id: report.lead_id,
      type: 'report_open',
      occurred_at: now.toISOString(),
      payload: { report_id: report.id },
      source_kind: 'report',
      fub_id: null,
    })
  }

  return NextResponse.json({ ok: true })
}
