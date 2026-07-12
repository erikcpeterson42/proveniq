// Pure types for the valuation pipeline. Like /lib/scoring, everything in
// /lib/valuation is deterministic and I/O-free; the orchestrator job wires
// these functions to FUB, RentCast, and the database.

// The slice of a lead row that qualification needs.
export interface ValuationLead {
  id: number
  name: string | null
  lead_type: 'buyer' | 'seller' | null
  tags: string[]
  address_street: string | null
  city: string | null
  address_state: string | null
  address_zip: string | null
}

// What should happen for this lead.
export type Disposition =
  | 'auto_send' // homeowner + seller signal: generate and email automatically
  | 'hold_review' // homeowner, no seller signal: generate, agent approves
  | 'needs_address' // seller signal but no usable address: surface to the team
  | 'skip' // nothing to work with

export interface QualifyResult {
  disposition: Disposition
  /** Single-line address for data lookups, e.g. "12 Main St, Williston, ND 58801". */
  address: string | null
}

// One comparable sale as stored on the report (already trimmed for display).
export interface ReportComp {
  address: string
  price: number
  beds: number | null
  baths: number | null
  sqft: number | null
  distance_mi: number | null
  similarity: number | null // 0-1
}

export type Confidence = 'high' | 'medium' | 'low'

export interface ValueRange {
  /** Client-facing range, rounded to presentable numbers. */
  low: number
  high: number
  best: number
  confidence: Confidence
  compCount: number
}
