import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRange, presentableRound, confidenceFor, isThinData, formatMoney } from './range.ts'
import type { ReportComp } from './types.ts'

const comp = (price: number): ReportComp => ({
  address: 'x', price, beds: 3, baths: 2, sqft: 1500, distance_mi: 0.5, similarity: 0.9,
})

test('presentableRound: $5k steps at 200k+, $1k below', () => {
  assert.equal(presentableRound(412_340), 410_000)
  assert.equal(presentableRound(413_100), 415_000)
  assert.equal(presentableRound(187_432), 187_000)
})

test('buildRange uses source range and rounds it', () => {
  const r = buildRange({
    price: 412_340, priceRangeLow: 396_120, priceRangeHigh: 431_876,
    comps: [comp(400_000), comp(410_000), comp(420_000), comp(405_000), comp(415_000)],
  })
  assert.ok(r)
  assert.equal(r.best, 410_000)
  assert.equal(r.low, 395_000)
  assert.equal(r.high, 430_000)
  assert.equal(r.confidence, 'high')
})

test('buildRange falls back to ±8% when the source has no range', () => {
  const r = buildRange({ price: 300_000, comps: [comp(1), comp(2), comp(3)] })
  assert.ok(r)
  assert.equal(r.low, 275_000) // 276k rounded to 5k
  assert.equal(r.high, 325_000) // 324k rounded to 5k
  assert.equal(r.confidence, 'medium') // 16% spread, 3 comps
})

test('buildRange returns null with no usable value', () => {
  assert.equal(buildRange({ comps: [] }), null)
  assert.equal(buildRange({ price: 0, comps: [] }), null)
})

test('few comps or wide spread -> low confidence -> thin data', () => {
  assert.equal(confidenceFor(300_000, 280_000, 320_000, 2), 'low') // too few comps
  assert.equal(confidenceFor(300_000, 220_000, 380_000, 8), 'low') // >35% spread
  const r = buildRange({ price: 300_000, comps: [comp(1), comp(2)] })
  assert.ok(r)
  assert.equal(isThinData(r), true)
})

test('formatMoney', () => {
  assert.equal(formatMoney(412_000), '$412,000')
})
