import type { ValuationLead, QualifyResult } from './types.ts'

// Decides what the pipeline should do with a lead, per the agreed rules:
//   address + seller signal -> auto_send
//   address only            -> hold_review (agent approves before it goes out)
//   seller signal, no address -> needs_address (team digest asks for it)
//   neither                 -> skip
// Pure function: the "currently listed elsewhere" check happens later in the
// orchestrator because it needs a data-source call.

// A street line we can actually run a valuation on: a house number followed
// by at least one word ("12 Main St"). Filters out "N/A", lone city names,
// and PO boxes (no comps exist for a PO box).
const STREET_RE = /^\s*\d+\s+\S+/
const PO_BOX_RE = /p\.?\s*o\.?\s*box/i

export function hasUsableAddress(lead: ValuationLead): boolean {
  const street = lead.address_street ?? ''
  return STREET_RE.test(street) && !PO_BOX_RE.test(street) && !!lead.city
}

// Seller signal: the derived lead_type (from tags/stage) already encodes our
// tag conventions, and 'seller' wins ties per lib/fub/map.ts.
export function hasSellerSignal(lead: ValuationLead): boolean {
  return lead.lead_type === 'seller'
}

/** Single-line address for RentCast/Zillow lookups. */
export function formatAddress(lead: ValuationLead): string | null {
  if (!hasUsableAddress(lead)) return null
  const parts = [
    lead.address_street!.trim(),
    lead.city!.trim(),
    [lead.address_state, lead.address_zip].filter(Boolean).join(' ').trim(),
  ].filter((p) => p.length > 0)
  return parts.join(', ')
}

export function qualify(lead: ValuationLead): QualifyResult {
  const address = formatAddress(lead)
  const seller = hasSellerSignal(lead)
  if (address && seller) return { disposition: 'auto_send', address }
  if (address) return { disposition: 'hold_review', address }
  if (seller) return { disposition: 'needs_address', address: null }
  return { disposition: 'skip', address: null }
}
