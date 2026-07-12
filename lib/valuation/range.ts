import type { ReportComp, ValueRange, Confidence } from './types.ts'

// Turns a raw AVM result into the client-facing value range, and decides how
// much we trust it. Per the agreed rules we always show a RANGE, and a
// low-confidence result is held for agent review instead of auto-sent.

// Round to numbers a human would say out loud: nearest $5k at $200k+,
// nearest $1k below that.
export function presentableRound(value: number): number {
  const step = value >= 200_000 ? 5_000 : 1_000
  return Math.round(value / step) * step
}

export interface AvmInput {
  price?: number
  priceRangeLow?: number
  priceRangeHigh?: number
  comps: ReportComp[]
}

/**
 * Build the presentation range. Returns null when there is no usable value
 * at all (the orchestrator records that as hold_reason 'no_data').
 */
export function buildRange(avm: AvmInput): ValueRange | null {
  const best = avm.price
  if (!best || best <= 0) return null

  // Fall back to ±8% when the source doesn't provide its own range.
  const rawLow = avm.priceRangeLow && avm.priceRangeLow > 0 ? avm.priceRangeLow : best * 0.92
  const rawHigh = avm.priceRangeHigh && avm.priceRangeHigh > best ? avm.priceRangeHigh : best * 1.08

  return {
    low: presentableRound(Math.min(rawLow, best)),
    high: presentableRound(Math.max(rawHigh, best)),
    best: presentableRound(best),
    confidence: confidenceFor(best, rawLow, rawHigh, avm.comps.length),
    compCount: avm.comps.length,
  }
}

// Confidence = enough comps + a tight spread. Rural Williston-area addresses
// often have few sales nearby, which is exactly when we want an agent's eyes
// on the report before a client sees it.
export function confidenceFor(
  best: number,
  low: number,
  high: number,
  compCount: number,
): Confidence {
  const spread = (high - low) / best
  if (compCount >= 5 && spread <= 0.2) return 'high'
  if (compCount >= 3 && spread <= 0.35) return 'medium'
  return 'low'
}

/** Low confidence -> hold for review rather than auto-send. */
export function isThinData(range: ValueRange): boolean {
  return range.confidence === 'low'
}

/** "$412,000" — used by the report page, PDF, and email. */
export function formatMoney(value: number): string {
  return '$' + Math.round(value).toLocaleString('en-US')
}
