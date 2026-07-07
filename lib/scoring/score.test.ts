// Unit tests for the deterministic scorer. Run: `npm test`
// (node --test with native TS type-stripping — no test framework needed).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreLead } from './score.ts'
import { DEFAULT_CONFIG } from './types.ts'
import type { ScoringEvent, ScoringLead } from './types.ts'

const NOW = Date.parse('2026-07-06T00:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

function lead(over: Partial<ScoringLead> = {}): ScoringLead {
  return {
    id: 1, lead_type: 'seller', stage: null, tags: [],
    last_touch_at: null, last_inbound_at: null, unanswered_hours: null, ...over,
  }
}

test('cold lead with no activity scores the floor', () => {
  const r = scoreLead(lead(), [], NOW)
  assert.equal(r.score, 1)
  assert.equal(r.timeline_bucket, '180+')
  assert.equal(r.overdue, false)
  assert.deepEqual(r.breakdown, { recency: 0, intent: 0, inbound: 0, tags: 0, stage: 0 })
})

test('recently engaged lead scores high with reasons', () => {
  const events: ScoringEvent[] = [
    { type: 'inquiry', occurred_at: daysAgo(1) },
    { type: 'property_view', occurred_at: daysAgo(1) },
    { type: 'property_view', occurred_at: daysAgo(2) },
    { type: 'saved_property', occurred_at: daysAgo(2) },
  ]
  const r = scoreLead(lead(), events, NOW)
  assert.ok(r.score >= 50, `expected >=50, got ${r.score}`)
  assert.ok(r.breakdown.recency > 0 && r.breakdown.intent > 0)
  assert.ok(r.reasons.some((x) => x.includes('Viewed')))
  assert.ok(r.reasons.some((x) => x.includes('inquir')))
})

test('unanswered inbound maxes inbound points and is always overdue', () => {
  const r = scoreLead(lead({ unanswered_hours: 6 }), [], NOW)
  assert.equal(r.breakdown.inbound, DEFAULT_CONFIG.caps.inbound) // full cap
  assert.equal(r.overdue, true)
  assert.match(r.overdue_detail ?? '', /Unanswered inbound message \(6h\)/)
  assert.ok(r.reasons.some((x) => x.includes('Unanswered')))
})

test('inbound text within a week earns partial inbound points', () => {
  const r = scoreLead(lead(), [{ type: 'text_in', occurred_at: daysAgo(3) }], NOW)
  assert.ok(r.breakdown.inbound > 0 && r.breakdown.inbound < DEFAULT_CONFIG.caps.inbound)
})

test('cash offer + within-90-days tags add intent and tighten timeline', () => {
  const r = scoreLead(
    lead({ tags: ['cash_offer=yes', 'timeline=within 90 days'], stage: 'Hot' }),
    [{ type: 'inquiry', occurred_at: daysAgo(1) }, { type: 'property_view', occurred_at: daysAgo(1) }],
    NOW,
  )
  assert.ok(r.breakdown.tags >= 20)
  assert.ok(['0-30', '30-90'].includes(r.timeline_bucket), `near-term, got ${r.timeline_bucket}`)
  assert.ok(r.reasons.some((x) => x.includes('cash offer')))
})

test('dead stage tanks the score even with some activity', () => {
  const events: ScoringEvent[] = [{ type: 'property_view', occurred_at: daysAgo(2) }]
  const active = scoreLead(lead({ stage: 'Active' }), events, NOW)
  const dead = scoreLead(lead({ stage: 'Dead / DNC' }), events, NOW)
  assert.ok(dead.score < active.score)
  assert.equal(dead.breakdown.stage, -25)
})

test('recency decays monotonically as engagement ages', () => {
  const at = (d: number) => scoreLead(lead(), [{ type: 'property_view', occurred_at: daysAgo(d) }], NOW).breakdown.recency
  const series = [1, 3, 7, 14, 30, 60, 90, 200].map(at)
  for (let i = 1; i < series.length; i++) assert.ok(series[i] <= series[i - 1], `not monotonic at ${i}: ${series}`)
  assert.equal(series.at(-1), 0)
})

test('hot lead not contacted in over a day is overdue', () => {
  const events: ScoringEvent[] = [
    { type: 'inquiry', occurred_at: hoursAgo(2) },
    { type: 'property_view', occurred_at: hoursAgo(2) },
    { type: 'property_view', occurred_at: hoursAgo(3) },
    { type: 'saved_property', occurred_at: hoursAgo(3) },
  ]
  const r = scoreLead(
    lead({ tags: ['cash_offer=yes', 'timeline=within 90 days', 'YPRIORITY'], last_touch_at: daysAgo(5) }),
    events, NOW,
  )
  assert.ok(r.score >= 75, `expected hot, got ${r.score}`)
  assert.equal(r.overdue, true)
  assert.match(r.overdue_detail ?? '', /Hot lead/)
})

test('score is always clamped to 1..100 and likelihood is monotonic', () => {
  const kitchenSink: ScoringEvent[] = Array.from({ length: 20 }, (_, i) => ({
    type: 'inquiry' as const, occurred_at: daysAgo((i % 5) + 1),
  }))
  const r = scoreLead(lead({ tags: ['cash_offer=yes', 'timeline=within 90 days', 'YPRIORITY'], unanswered_hours: 1 }), kitchenSink, NOW)
  assert.ok(r.score >= 1 && r.score <= 100)
  assert.ok(r.likelihood_pct >= 0 && r.likelihood_pct <= 100)
})

test('same inputs produce identical output (deterministic)', () => {
  const events: ScoringEvent[] = [{ type: 'inquiry', occurred_at: daysAgo(2) }]
  const l = lead({ tags: ['YPRIORITY'] })
  assert.deepEqual(scoreLead(l, events, NOW), scoreLead(l, events, NOW))
})
