// Realistic sample data for previewing the report template (web + PDF)
// without a database row or a RentCast call.

import type { ReportRecord } from './report'

export const SAMPLE_REPORT: ReportRecord = {
  id: 'preview',
  token: 'preview',
  lead_id: 0,
  status: 'held',
  hold_reason: null,
  run_kind: 'manual',
  address_formatted: '1418 11th Ave W, Williston, ND 58801',
  address_street: '1418 11th Ave W',
  address_city: 'Williston',
  address_state: 'ND',
  address_zip: '58801',
  value_low: 295_000,
  value_high: 330_000,
  value_best: 312_000,
  confidence: 'high',
  property: {
    beds: 4, baths: 2, sqft: 2140, lotSize: 8712, yearBuilt: 1978,
    propertyType: 'Single Family', lastSalePrice: 214_000, lastSaleDate: '2014-06-20',
  },
  comps: [
    { address: '1322 10th Ave W, Williston, ND', price: 318_500, beds: 4, baths: 2, sqft: 2210, distance_mi: 0.2, similarity: 0.95 },
    { address: '905 14th St W, Williston, ND', price: 301_000, beds: 3, baths: 2, sqft: 1980, distance_mi: 0.4, similarity: 0.91 },
    { address: '2117 9th Ave W, Williston, ND', price: 329_900, beds: 4, baths: 3, sqft: 2350, distance_mi: 0.6, similarity: 0.88 },
    { address: '816 18th St W, Williston, ND', price: 289_000, beds: 3, baths: 2, sqft: 1875, distance_mi: 0.8, similarity: 0.84 },
    { address: '1504 Harmon Park Ct, Williston, ND', price: 315_000, beds: 4, baths: 2, sqft: 2090, distance_mi: 0.9, similarity: 0.83 },
  ],
  market: { medianPrice: 289_500, averageDaysOnMarket: 47, totalListings: 132 },
  narrative: {
    intro:
      'Hi Sarah, we put this report together specifically for your home on 11th Avenue West. It pulls recent sales around you, public records, and current market activity in Williston into one honest picture of what your home is likely worth today.',
    value_context:
      'The range reflects what similar homes near you have actually sold for recently. Where your home lands inside it depends on condition, updates, and the things an automated model can’t see — which is exactly what an in-person look settles.',
    market_snapshot:
      'Williston homes are currently selling at a median of $289,500, and the typical home goes under contract in about 47 days. With 132 homes on the market, well-priced properties in established neighborhoods are moving steadily.',
    comps_note:
      'These five sales are all within a mile of you and closely match your home’s size and layout.',
    email_subject: 'Your home value report for 1418 11th Ave W',
    email_preview: 'A current estimate for your Williston home, with the recent sales behind it.',
  },
  listing: null,
  zillow_url: null,
  created_at: '2026-07-11T00:00:00.000Z',
  sent_at: null,
  last_opened_at: null,
  open_count: 0,
  leads: { name: 'Sarah Example', first_name: 'Sarah', email: null, assigned_agent: null },
}
