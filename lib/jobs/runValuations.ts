// Deal Radar orchestrator. Runs inside the nightly cron:
//   - every night: value NEW leads that entered the ecosystem since last run
//   - Monday:      the backlog slice (sellers, 90-day timeline + YPRIORITY)
//   - any night:   quarterly refreshes that have come due
// Wires the pure /lib/valuation logic to FUB data in Supabase, RentCast,
// Claude narrative, and the delivery email. Budget-guarded end to end.

import { createAdminClient } from '@/lib/supabase/admin'
import { createAnthropic } from '@/lib/anthropic/client'
import { RentCastClient } from '@/lib/rentcast/client'
import { reserveCalls, refundCalls, usageSummary } from '@/lib/rentcast/budget'
import { qualify } from '@/lib/valuation/qualify'
import { buildRange, isThinData } from '@/lib/valuation/range'
import { zillowUrl } from '@/lib/valuation/zillow'
import type { ValuationLead, ReportComp } from '@/lib/valuation/types'
import { generateNarrative } from '@/lib/ai/valuationNarrative'
import { sendValuationEmail } from '@/lib/jobs/sendValuationEmail'
import { isExcludedName } from '@/lib/scoring/exclude'

type Db = ReturnType<typeof createAdminClient>
type Outcome =
  | 'sent' | 'held' | 'needs_address' | 'no_data' | 'skipped'
  | 'failed' | 'budget_exhausted'

interface LeadRow extends ValuationLead {
  first_name: string | null
  email: string | null
  fub_created_at: string | null
}
const LEAD_COLS =
  'id, name, first_name, email, lead_type, tags, address_street, city, address_state, address_zip, fub_created_at'

// Central-time day for the "Monday slice" check (cron fires at a fixed UTC hour).
const LOCAL_OFFSET_H = 6
export function isLocalMonday(now = new Date()): boolean {
  return new Date(now.getTime() - LOCAL_OFFSET_H * 3_600_000).getUTCDay() === 1
}

function maxPerRun(): number {
  const n = Number(process.env.VALUATION_MAX_PER_RUN)
  return Number.isFinite(n) && n > 0 ? n : 10
}

// --- zip-level market stats, cached one call per zip per month ---
async function marketFor(db: Db, rc: RentCastClient, zip: string | null) {
  if (!zip) return null
  const key = `rentcast_market_${zip}`
  const month = new Date().toISOString().slice(0, 7)
  const { data } = await db.from('sync_state').select('value').eq('key', key).maybeSingle()
  const cached = data?.value as { month?: string; market?: unknown } | null
  if (cached?.month === month) return (cached.market ?? null) as ReturnType<typeof pickMarket>
  if (!(await reserveCalls(db, 1))) return null
  const raw = await rc.marketStats(zip).catch(() => null)
  const market = pickMarket(raw)
  await db.from('sync_state').upsert({ key, value: { month, market } })
  return market
}
function pickMarket(raw: Awaited<ReturnType<RentCastClient['marketStats']>> | null) {
  const s = raw?.saleData
  if (!s) return null
  return {
    medianPrice: s.medianPrice,
    averagePrice: s.averagePrice,
    averagePricePerSquareFoot: s.averagePricePerSquareFoot,
    averageDaysOnMarket: s.averageDaysOnMarket,
    totalListings: s.totalListings,
  }
}

// Generate (and possibly send) one report. Returns what happened.
// send=false parks an auto_send report as 'held' instead of emailing —
// used by manual runs so a test never reaches a real client.
async function processLead(
  db: Db, rc: RentCastClient, lead: LeadRow, runKind: string, send = true,
): Promise<{ outcome: Outcome; token?: string }> {
  if (isExcludedName(lead.name)) return { outcome: 'skipped' }
  const q = qualify(lead)

  if (q.disposition === 'needs_address') {
    // One standing "needs address" row per lead; don't duplicate weekly.
    const { data: existing } = await db.from('valuation_reports')
      .select('id').eq('lead_id', lead.id).eq('hold_reason', 'needs_address').limit(1)
    if (!existing?.length) {
      await db.from('valuation_reports').insert({
        lead_id: lead.id, run_kind: runKind, status: 'skipped', hold_reason: 'needs_address',
      })
    }
    return { outcome: 'needs_address' }
  }
  if (q.disposition === 'skip' || !q.address) return { outcome: 'skipped' }

  // 3 calls: value estimate, property record, active-listing check.
  if (!(await reserveCalls(db, 3))) return { outcome: 'budget_exhausted' }
  const before = rc.callsMade
  const [avm, prop, activeListing] = await Promise.all([
    rc.valueEstimate(q.address),
    rc.propertyRecord(q.address),
    rc.activeSaleListing(q.address),
  ])
  await refundCalls(db, 3 - (rc.callsMade - before))

  const zip = lead.address_zip ?? prop?.zipCode ?? null
  const baseRow = {
    lead_id: lead.id,
    run_kind: runKind,
    address_street: lead.address_street,
    address_city: lead.city,
    address_state: lead.address_state ?? prop?.state ?? null,
    address_zip: zip,
    address_formatted: q.address,
    zillow_url: zillowUrl(q.address),
  }

  const comps: ReportComp[] = (avm?.comparables ?? [])
    .filter((c) => c.price && c.formattedAddress)
    .map((c) => ({
      address: c.formattedAddress!,
      price: c.price!,
      beds: c.bedrooms ?? null,
      baths: c.bathrooms ?? null,
      sqft: c.squareFootage ?? null,
      distance_mi: c.distance ?? null,
      similarity: c.correlation ?? null,
    }))
  const range = buildRange({
    price: avm?.price, priceRangeLow: avm?.priceRangeLow, priceRangeHigh: avm?.priceRangeHigh, comps,
  })
  if (!range) {
    await db.from('valuation_reports')
      .insert({ ...baseRow, status: 'skipped', hold_reason: 'no_data' })
    return { outcome: 'no_data' }
  }

  const property = prop && {
    beds: prop.bedrooms, baths: prop.bathrooms, sqft: prop.squareFootage,
    lotSize: prop.lotSize, yearBuilt: prop.yearBuilt, propertyType: prop.propertyType,
    lastSalePrice: prop.lastSalePrice, lastSaleDate: prop.lastSaleDate,
  }
  const market = await marketFor(db, rc, zip)
  // Kept for the team digest: who has it listed, at what price, since when.
  const listing = activeListing && {
    price: activeListing.price,
    listedDate: activeListing.listedDate,
    daysOnMarket: activeListing.daysOnMarket,
    mlsName: activeListing.mlsName,
    office: activeListing.listingOffice?.name,
    agent: activeListing.listingAgent?.name,
  }

  // The ethics guard + quality gate, in priority order.
  const holdReason = activeListing
    ? 'listed_elsewhere' // never auto-email a seller listed with another brokerage
    : isThinData(range)
      ? 'thin_data'
      : q.disposition === 'hold_review'
        ? 'address_only'
        : null

  let narrative = null
  try {
    narrative = await generateNarrative(createAnthropic(), {
      firstName: lead.first_name ?? lead.name,
      address: q.address,
      range,
      property: property ?? {},
      comps,
      market,
    })
  } catch (e) {
    // A report without narrative is still useful to the team; hold it.
    console.error(`[valuations] narrative failed for lead ${lead.id}:`, (e as Error).message)
  }

  const { data: inserted, error } = await db.from('valuation_reports').insert({
    ...baseRow,
    status: 'pending',
    hold_reason: holdReason,
    value_low: range.low, value_high: range.high, value_best: range.best,
    confidence: range.confidence,
    property, comps, market, narrative, listing,
    error: narrative ? null : 'narrative generation failed',
  }).select('token').single()
  if (error) throw new Error('valuation_reports insert: ' + error.message)

  if (holdReason || !narrative || !send) {
    await db.from('valuation_reports')
      .update({
        status: 'held',
        hold_reason: holdReason ?? (narrative ? null : 'thin_data'),
      })
      .eq('token', inserted.token)
    return { outcome: 'held', token: inserted.token }
  }
  const sent = await sendValuationEmail(inserted.token)
  // no-email etc. leaves it held with a reason
  return { outcome: sent.sent ? 'sent' : 'held', token: inserted.token }
}

/**
 * Value ONE lead on demand (admin/testing). Defaults to send:false — the
 * report is generated and parked in the review queue, never auto-emailed.
 */
export async function valuateLeadById(
  leadId: number,
  opts: { send?: boolean } = {},
): Promise<{ outcome: Outcome; token?: string }> {
  const db = createAdminClient()
  const rc = new RentCastClient()
  const { data: lead } = await db.from('leads').select(LEAD_COLS).eq('id', leadId).maybeSingle()
  if (!lead) return { outcome: 'skipped' }
  return processLead(db, rc, lead as LeadRow, 'manual', opts.send ?? false)
}

// Leads that already have a live report (pending/held/sent) are done —
// quarterly refresh is the only path that re-runs them.
async function withoutExistingReports(db: Db, leads: LeadRow[]): Promise<LeadRow[]> {
  if (!leads.length) return []
  const { data } = await db.from('valuation_reports')
    .select('lead_id').in('lead_id', leads.map((l) => l.id))
    .in('status', ['pending', 'held', 'sent'])
  const taken = new Set((data ?? []).map((r) => r.lead_id as number))
  return leads.filter((l) => !taken.has(l.id))
}

async function runBatch(
  db: Db, rc: RentCastClient, leads: LeadRow[], runKind: string, counts: Record<string, number>,
): Promise<{ ok: boolean; processed: number }> {
  let processed = 0
  for (const lead of leads) {
    try {
      const { outcome } = await processLead(db, rc, lead, runKind)
      counts[outcome] = (counts[outcome] ?? 0) + 1
      if (outcome === 'budget_exhausted') return { ok: false, processed } // stop everything
    } catch (e) {
      counts.failed = (counts.failed ?? 0) + 1
      console.error(`[valuations] lead ${lead.id} failed:`, (e as Error).message)
    }
    processed++
  }
  return { ok: true, processed }
}

export async function runValuations(): Promise<Record<string, unknown>> {
  const db = createAdminClient()
  const rc = new RentCastClient()
  const counts: Record<string, number> = {}
  const cap = maxPerRun()
  const nowIso = new Date().toISOString()

  // --- nightly: leads new to the ecosystem since the watermark ---
  const { data: state } = await db.from('sync_state').select('value').eq('key', 'valuation_daily').maybeSingle()
  const watermark = (state?.value as { watermark?: string } | null)?.watermark
  let budgetOk = true
  // First run only initializes the watermark — the backlog belongs to Monday.
  let newWatermark = nowIso
  if (watermark) {
    const { data } = await db.from('leads').select(LEAD_COLS)
      .gt('fub_created_at', watermark).order('fub_created_at', { ascending: true }).limit(cap)
    const rows = (data ?? []) as LeadRow[]
    const fresh = await withoutExistingReports(db, rows)
    const batch = await runBatch(db, rc, fresh, 'daily_new', counts)
    budgetOk = batch.ok
    if (!batch.ok) {
      // Budget stopped us mid-batch: resume from the last lead we finished
      // so tomorrow's run picks up exactly where we left off.
      const done = fresh.slice(0, batch.processed)
      newWatermark = done.length ? done[done.length - 1].fub_created_at ?? watermark : watermark
    } else if (rows.length === cap) {
      // More new leads exist than this run's cap — don't skip past them.
      newWatermark = rows[rows.length - 1].fub_created_at ?? nowIso
    }
  }
  await db.from('sync_state').upsert({ key: 'valuation_daily', value: { watermark: newWatermark } })

  // --- Monday: the agreed backlog slice ---
  if (budgetOk && isLocalMonday()) {
    const { data } = await db.from('leads').select(LEAD_COLS)
      .eq('lead_type', 'seller')
      .contains('tags', JSON.stringify(['YPRIORITY', 'timeline=within 90 days']))
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .limit(cap * 3)
    const fresh = (await withoutExistingReports(db, (data ?? []) as LeadRow[])).slice(0, cap)
    budgetOk = (await runBatch(db, rc, fresh, 'monday_backlog', counts)).ok
  }

  // --- quarterly refreshes that have come due ---
  if (budgetOk) {
    const { data: due } = await db.from('valuation_reports')
      .select('id, lead_id').eq('status', 'sent')
      .lte('refresh_due_at', nowIso).limit(cap)
    for (const r of due ?? []) {
      const { data: lead } = await db.from('leads').select(LEAD_COLS).eq('id', r.lead_id).maybeSingle()
      // Un-schedule first so a failure doesn't retry forever every night.
      await db.from('valuation_reports').update({ refresh_due_at: null }).eq('id', r.id)
      if (!lead) continue
      try {
        const { outcome } = await processLead(db, rc, lead as LeadRow, 'quarterly_refresh')
        counts[`refresh_${outcome}`] = (counts[`refresh_${outcome}`] ?? 0) + 1
        if (outcome === 'budget_exhausted') break
      } catch (e) {
        counts.refresh_failed = (counts.refresh_failed ?? 0) + 1
        console.error(`[valuations] refresh for lead ${r.lead_id} failed:`, (e as Error).message)
      }
    }
  }

  return { counts, rentcast: await usageSummary(db) }
}
