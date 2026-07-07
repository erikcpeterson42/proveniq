// Types for the deterministic scoring core. Everything here is plain data:
// the scorer takes a ScoringLead + its ScoringEvent[] and returns a
// ScoreResult. No DB rows, no I/O — see ./score.ts for the pure functions.

import type { LeadEventType } from '../fub/types.ts'

// Minimal lead shape the scorer needs (a subset of the `leads` table).
export interface ScoringLead {
  id: number
  lead_type: 'buyer' | 'seller' | null
  stage: string | null
  tags: string[]
  last_touch_at: string | null // our last OUTBOUND contact (ISO)
  last_inbound_at: string | null // lead's last INBOUND message (ISO)
  unanswered_hours: number | null // hours an inbound has gone unanswered
}

// Minimal event shape (a subset of the `lead_events` table).
export interface ScoringEvent {
  type: LeadEventType
  occurred_at: string // ISO
  payload?: Record<string, unknown> | null
}

export type TimelineBucket = '0-30' | '30-90' | '90-180' | '180+'

// Per-component point contributions, surfaced for transparency/debugging
// and stored in lead_scores.score_breakdown.
export interface ScoreBreakdown {
  recency: number // how recently the lead engaged
  intent: number // volume/weight of high-intent activity
  inbound: number // recent inbound comms (they reached out)
  tags: number // intent encoded in FUB tags (cash_offer, timeline, ...)
  stage: number // pipeline-stage adjustment (can be negative)
}

export interface ScoreResult {
  score: number // 1-100 motivation to transact soon
  likelihood_pct: number // 0-100, calibrated from score
  timeline_bucket: TimelineBucket
  overdue: boolean
  overdue_detail: string | null
  reasons: string[] // human-readable "why they're here" signals
  breakdown: ScoreBreakdown
}

// Tunable knobs. Caps bound each positive component. They deliberately sum to
// MORE than 100 (35+30+28+25 = 118) so no single missing channel caps the
// ceiling — a genuinely hot lead reaches the top on engagement + intent + tags
// alone, and inbound comms push it further before the final clamp to 100. This
// matters because texts/emails aren't fully synced yet: their absence must not
// suppress otherwise-hot leads.
export interface ScoreConfig {
  hotTouchDays: number // touch a HOT lead at least this often (default 1)
  warmTouchDays: number // touch a WARM lead at least this often (default 3)
  hotScore: number // score >= this counts as "hot" (default 75)
  warmScore: number // score >= this counts as "warm" (default 50)
  caps: {
    recency: number
    intent: number
    inbound: number
    tags: number
  }
}

export const DEFAULT_CONFIG: ScoreConfig = {
  hotTouchDays: 1,
  warmTouchDays: 3,
  hotScore: 75,
  warmScore: 50,
  caps: { recency: 35, intent: 30, inbound: 28, tags: 25 },
}
