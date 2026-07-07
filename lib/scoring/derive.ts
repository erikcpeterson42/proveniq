// Pure derivations that round out the per-lead output contract:
// best_contact_window (from historical engagement timing) and a
// deterministic next_action line. No I/O — same inputs, same output.

import type { ScoreResult, ScoringEvent, ScoringLead } from './types.ts'

// Proven Realty operates in western North Dakota / Mountain time. Event
// timestamps are UTC; we shift by this to bucket by the lead's local hour.
const MOUNTAIN_OFFSET_H = 6

type Window = 'Morning (8-12)' | 'Midday (12-3)' | 'Afternoon (3-6)' | 'Evening (6-9)'

// The time-of-day window when this lead has historically engaged, inferred
// from the mode of their engagement/inbound event hours. null if unknown.
export function bestContactWindow(events: ScoringEvent[]): string | null {
  const buckets: Record<Window, number> = {
    'Morning (8-12)': 0, 'Midday (12-3)': 0, 'Afternoon (3-6)': 0, 'Evening (6-9)': 0,
  }
  let seen = 0
  for (const e of events) {
    const t = Date.parse(e.occurred_at)
    if (Number.isNaN(t)) continue
    const hour = (new Date(t).getUTCHours() - MOUNTAIN_OFFSET_H + 24) % 24
    const w = windowForHour(hour)
    if (!w) continue
    buckets[w]++
    seen++
  }
  if (seen === 0) return null
  let best: Window = 'Morning (8-12)'
  for (const w of Object.keys(buckets) as Window[]) if (buckets[w] > buckets[best]) best = w
  return best
}

function windowForHour(hour: number): Window | null {
  if (hour >= 8 && hour < 12) return 'Morning (8-12)'
  if (hour >= 12 && hour < 15) return 'Midday (12-3)'
  if (hour >= 15 && hour < 18) return 'Afternoon (3-6)'
  if (hour >= 18 && hour < 21) return 'Evening (6-9)'
  return null // outside business hours → not a useful window
}

// One imperative line telling the agent what to do next. Deterministic
// default; the AI script layer can produce a richer version later.
export function nextAction(lead: ScoringLead, result: ScoreResult): string {
  const seller = lead.lead_type === 'seller'
  if (result.overdue_detail?.startsWith('Unanswered')) {
    return 'Reply now — they messaged and are waiting on a response.'
  }
  const has = (frag: string) => result.reasons.some((r) => r.includes(frag))
  if (has('cash offer')) return 'Call to discuss their cash-offer interest and next steps.'
  if (has('Viewed')) {
    return seller
      ? 'Call about the homes they viewed — a natural opening to talk listing plans.'
      : 'Call about the properties they viewed and offer to set up showings.'
  }
  if (has('inquir')) return 'Follow up on their recent inquiry while it is top of mind.'
  if (has('Saved')) return 'Reach out about the property they saved and gauge urgency.'
  if (result.overdue) return 'Reconnect today — this lead is overdue for a touch.'
  return seller
    ? 'Check in on their home-sale timeline and offer a fresh valuation.'
    : 'Touch base to keep this lead engaged.'
}
