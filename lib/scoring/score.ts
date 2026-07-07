// Deterministic lead scoring — pure functions only (no I/O, no side effects).
// Same inputs always produce the same ScoreResult, so this stays trivially
// unit-testable (see ./score.test.ts). The AI-generated scripts/motivation
// layer lives elsewhere and consumes this output.

import type { LeadEventType } from '../fub/types.ts'
import {
  DEFAULT_CONFIG,
  type ScoreConfig,
  type ScoreResult,
  type ScoringEvent,
  type ScoringLead,
  type TimelineBucket,
} from './types.ts'

const DAY_MS = 86_400_000
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// Whole days between an ISO timestamp and `now` (>= 0; null → Infinity).
function daysSince(iso: string | null | undefined, now: number): number {
  if (!iso) return Infinity
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return Infinity
  return Math.max(0, (now - t) / DAY_MS)
}

function isInboundCall(e: ScoringEvent): boolean {
  return e.type === 'call' && (e.payload?.direction ?? '') === 'inbound'
}

// Events that signal the lead is actively engaging (not our outreach).
const ENGAGEMENT: ReadonlySet<LeadEventType> = new Set<LeadEventType>([
  'property_view', 'saved_property', 'inquiry', 'website_visit',
  'text_in', 'email_open', 'email_click',
])
function isEngagement(e: ScoringEvent): boolean {
  return ENGAGEMENT.has(e.type) || isInboundCall(e)
}

// --- component scorers -----------------------------------------------------

// Recency: how long since the lead last engaged. Step decay so a fresh
// signal is worth full points and interest fades over ~90 days.
function recencyPoints(days: number, cap: number): number {
  const pct =
    days <= 1 ? 1 :
    days <= 3 ? 0.86 :
    days <= 7 ? 0.72 :
    days <= 14 ? 0.55 :
    days <= 30 ? 0.34 :
    days <= 60 ? 0.17 :
    days <= 90 ? 0.07 : 0
  return Math.round(cap * pct)
}

// Intent: weighted volume of high-intent activity in the last 30 days.
// Inquiries and saved properties matter most; page visits least.
const INTENT_WEIGHT: Partial<Record<LeadEventType, number>> = {
  inquiry: 8, saved_property: 6, property_view: 3,
  text_in: 4, email_click: 2, website_visit: 1,
}
function intentPoints(events: ScoringEvent[], now: number, cap: number): number {
  let pts = 0
  for (const e of events) {
    if (daysSince(e.occurred_at, now) > 30) continue
    pts += INTENT_WEIGHT[e.type] ?? 0
  }
  return Math.min(cap, pts)
}

// Inbound comms: the lead reached out. An unanswered inbound is maximal
// (it's the strongest "call me now" signal we have).
function inboundPoints(lead: ScoringLead, events: ScoringEvent[], now: number, cap: number): number {
  if (lead.unanswered_hours != null) return cap
  let best = Infinity
  for (const e of events) {
    if (e.type === 'text_in' || isInboundCall(e)) {
      best = Math.min(best, daysSince(e.occurred_at, now))
    }
  }
  const pct =
    best <= 7 ? 0.7 :
    best <= 14 ? 0.4 :
    best <= 30 ? 0.2 : 0
  return Math.round(cap * pct)
}

// Tags: FUB tags encode declared intent. See CLAUDE.md tag conventions.
function tagPoints(tags: string[], cap: number): { points: number; reasons: string[] } {
  const hay = tags.map((t) => t.toLowerCase())
  const has = (s: string) => hay.some((t) => t.includes(s))
  let pts = 0
  const reasons: string[] = []
  if (has('cash_offer=yes') || has('cash offer')) { pts += 10; reasons.push('Tagged for a cash offer') }
  if (has('within 90 days') || has('timeline=within 90')) { pts += 10; reasons.push('Timeline: within 90 days') }
  else if (has('within 6 months')) { pts += 5; reasons.push('Timeline: within 6 months') }
  if (has('ypriority') || has('priority')) { pts += 6; reasons.push('Flagged priority (YPRIORITY)') }
  return { points: Math.min(cap, pts), reasons }
}

// Pipeline stage nudges the score. Cold/dead stages pull down; active,
// appointment-set, or hot stages push up.
function stageAdjustment(stage: string | null): number {
  if (!stage) return 0
  const s = stage.toLowerCase()
  if (/(dead|trash|lost|closed|do not|dnc)/.test(s)) return -25
  if (/(hot|appointment|under contract|active|negotiat|offer)/.test(s)) return 8
  if (/(cold|sunset|6\+|unresponsive)/.test(s)) return -8
  return 0
}

// --- derived fields --------------------------------------------------------

function timelineBucket(score: number, tags: string[]): TimelineBucket {
  const hay = tags.map((t) => t.toLowerCase())
  const has = (s: string) => hay.some((t) => t.includes(s))
  if (has('within 90 days')) return score >= 70 ? '0-30' : '30-90'
  if (has('within 6 months')) return '90-180'
  if (has('over 6 months')) return '180+'
  return score >= 75 ? '0-30' : score >= 55 ? '30-90' : score >= 35 ? '90-180' : '180+'
}

// Calibrated likelihood band from the score. Deliberately compressed vs the
// raw score so it reads as a probability, not a restated score.
function likelihoodPct(score: number): number {
  if (score >= 90) return 85
  if (score >= 80) return 72
  if (score >= 70) return 58
  if (score >= 60) return 45
  if (score >= 50) return 34
  if (score >= 40) return 24
  if (score >= 30) return 16
  if (score >= 20) return 9
  return 4
}

// Overdue: an unanswered inbound is always overdue; otherwise hot/warm leads
// have tighter contact SLAs than the rest.
function overdue(
  lead: ScoringLead, score: number, cfg: ScoreConfig, now: number,
): { overdue: boolean; detail: string | null } {
  if (lead.unanswered_hours != null) {
    const h = Math.round(lead.unanswered_hours)
    return { overdue: true, detail: `Unanswered inbound message (${h}h)` }
  }
  const sinceTouch = daysSince(lead.last_touch_at, now)
  const isHot = score >= cfg.hotScore
  const isWarm = score >= cfg.warmScore
  if (isHot && sinceTouch > cfg.hotTouchDays) {
    if (sinceTouch === Infinity) return { overdue: true, detail: 'Hot lead never contacted' }
    return { overdue: true, detail: `Hot lead, last contacted ${Math.floor(sinceTouch)}d ago` }
  }
  if (isWarm && sinceTouch > cfg.warmTouchDays) {
    if (sinceTouch === Infinity) return { overdue: true, detail: 'Warm lead never contacted' }
    return { overdue: true, detail: `Warm lead, last contacted ${Math.floor(sinceTouch)}d ago` }
  }
  return { overdue: false, detail: null }
}

// --- main entry point ------------------------------------------------------

/**
 * Score a single lead's motivation to transact soon (1-100) from its record
 * and event history. Pure: `now` is passed in so results are reproducible.
 */
export function scoreLead(
  lead: ScoringLead,
  events: ScoringEvent[],
  now: number = Date.now(),
  config: Partial<ScoreConfig> = {},
): ScoreResult {
  const cfg: ScoreConfig = { ...DEFAULT_CONFIG, ...config, caps: { ...DEFAULT_CONFIG.caps, ...config.caps } }
  const reasons: string[] = []

  // Most recent engagement drives recency.
  let lastEngagement = Infinity
  for (const e of events) {
    if (isEngagement(e)) lastEngagement = Math.min(lastEngagement, daysSince(e.occurred_at, now))
  }

  const recency = recencyPoints(lastEngagement, cfg.caps.recency)
  const intent = intentPoints(events, now, cfg.caps.intent)
  const inbound = inboundPoints(lead, events, now, cfg.caps.inbound)
  const tag = tagPoints(lead.tags, cfg.caps.tags)
  const stage = stageAdjustment(lead.stage)

  const raw = recency + intent + inbound + tag.points + stage
  const score = clamp(Math.round(raw), 1, 100)

  // Build human-readable reasons from the signals that actually fired.
  if (lead.unanswered_hours != null) reasons.push(`Unanswered inbound (${Math.round(lead.unanswered_hours)}h ago)`)
  if (lastEngagement <= 7) reasons.push(`Engaged in the last ${Math.max(1, Math.floor(lastEngagement))}d`)
  const views = events.filter((e) => e.type === 'property_view' && daysSince(e.occurred_at, now) <= 30).length
  if (views >= 2) reasons.push(`Viewed ${views} properties in the last 30d`)
  const saved = events.filter((e) => e.type === 'saved_property' && daysSince(e.occurred_at, now) <= 30).length
  if (saved >= 1) reasons.push(`Saved ${saved} propert${saved === 1 ? 'y' : 'ies'} recently`)
  const inquiries = events.filter((e) => e.type === 'inquiry' && daysSince(e.occurred_at, now) <= 30).length
  if (inquiries >= 1) reasons.push(`Submitted ${inquiries} inquir${inquiries === 1 ? 'y' : 'ies'} recently`)
  reasons.push(...tag.reasons)

  const od = overdue(lead, score, cfg, now)

  return {
    score,
    likelihood_pct: likelihoodPct(score),
    timeline_bucket: timelineBucket(score, lead.tags),
    overdue: od.overdue,
    overdue_detail: od.detail,
    reasons,
    breakdown: { recency, intent, inbound, tags: tag.points, stage },
  }
}
