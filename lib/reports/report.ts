// Shared shape + loader for valuation reports. Used by the public report
// page, the PDF route, and the delivery email so they all render the same
// data the same way.

import { createAdminClient } from '@/lib/supabase/admin'
import type { ReportComp, Confidence } from '@/lib/valuation/types'
import type { ReportNarrative } from '@/lib/ai/valuationNarrative'

export interface ReportProperty {
  beds?: number
  baths?: number
  sqft?: number
  lotSize?: number
  yearBuilt?: number
  propertyType?: string
  lastSalePrice?: number
  lastSaleDate?: string
}

export interface ReportListing {
  price?: number
  listedDate?: string
  daysOnMarket?: number
  mlsName?: string
  office?: string
  agent?: string
}

export interface ReportMarket {
  medianPrice?: number
  averagePrice?: number
  averagePricePerSquareFoot?: number
  averageDaysOnMarket?: number
  totalListings?: number
}

export interface ReportRecord {
  id: string
  token: string
  lead_id: number
  status: 'pending' | 'sent' | 'held' | 'skipped' | 'failed'
  hold_reason: string | null
  run_kind: string
  address_formatted: string | null
  address_street: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  value_low: number | null
  value_high: number | null
  value_best: number | null
  confidence: Confidence | null
  property: ReportProperty | null
  comps: ReportComp[] | null
  market: ReportMarket | null
  narrative: ReportNarrative | null
  listing: ReportListing | null
  zillow_url: string | null
  created_at: string
  sent_at: string | null
  last_opened_at: string | null
  open_count: number
  leads: {
    name: string | null
    first_name: string | null
    email: string | null
    assigned_agent: string | null
  } | null
}

const COLUMNS =
  'id, token, lead_id, status, hold_reason, run_kind, address_formatted, ' +
  'address_street, address_city, address_state, address_zip, ' +
  'value_low, value_high, value_best, confidence, property, comps, market, ' +
  'narrative, listing, zillow_url, created_at, sent_at, last_opened_at, open_count, ' +
  'leads(name, first_name, email, assigned_agent)'

/** Load one report by its public token (service role — no auth on /r pages). */
export async function loadReportByToken(token: string): Promise<ReportRecord | null> {
  // Tokens are 32 hex chars; refuse anything else before touching the DB.
  if (!/^[0-9a-f]{32}$/.test(token)) return null
  const db = createAdminClient()
  const { data, error } = await db
    .from('valuation_reports').select(COLUMNS).eq('token', token).maybeSingle()
  if (error) throw new Error('loadReportByToken: ' + error.message)
  return (data as unknown as ReportRecord) ?? null
}

/** "Mar 14, 2026" for report headers and footers. */
export function prettyReportDate(iso: string): string {
  const d = new Date(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

// The fixed call-to-action + compliance copy (owner-approved wording).
export const CTA_HEADLINE = 'Want your exact number?'
export const CTA_BODY =
  'For a more detailed analysis of your property to determine your exact equity, ' +
  'reach out and we’ll come by for a complimentary in-home equity evaluation.'
export const DISCLAIMER =
  'This report is an automated comparative market analysis prepared by Proven Realty, ' +
  'brokered by eXp Realty, using public records, recent comparable sales, and automated ' +
  'valuation models. It is an estimate intended to help you understand a probable market ' +
  'value range — it is not an appraisal and was not prepared by a licensed appraiser. ' +
  'Actual market value can only be determined by the market itself, and a detailed in-home ' +
  'evaluation will always be more accurate than any automated estimate.'
