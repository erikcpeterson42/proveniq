// Claude-written narrative sections for a valuation report. Server-side only.
// Structured outputs (like lib/ai/scripts.ts) so no brittle parsing, and
// claude-sonnet-5 rather than the flagship — this is bounded writing over
// data we hand it, not open-ended analysis.

import type Anthropic from '@anthropic-ai/sdk'
import { VALUATION_MODEL } from '@/lib/anthropic/client'
import type { ReportComp, ValueRange } from '@/lib/valuation/types'
import { formatMoney } from '@/lib/valuation/range'

export interface NarrativeContext {
  firstName: string | null
  address: string
  range: ValueRange
  property: {
    beds?: number
    baths?: number
    sqft?: number
    yearBuilt?: number
    lastSalePrice?: number
    lastSaleDate?: string
  }
  comps: ReportComp[]
  market: {
    medianPrice?: number
    averageDaysOnMarket?: number
    totalListings?: number
  } | null
}

export interface ReportNarrative {
  intro: string
  value_context: string
  market_snapshot: string
  comps_note: string
  email_subject: string
  email_preview: string
}

const NARRATIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intro: { type: 'string', description: '2-3 warm sentences addressed to the homeowner by first name (or "there" if unknown): what this report is and why we prepared it for their specific home.' },
    value_context: { type: 'string', description: '2-3 sentences explaining the estimated range honestly — what drives it and why it is a range, not one number. No hype.' },
    market_snapshot: { type: 'string', description: "2-3 sentences on the local market using ONLY the stats provided (median price, days on market, inventory). If stats are missing, write about what the comparable sales show instead." },
    comps_note: { type: 'string', description: '1-2 sentences on the comparable sales: how many, how close, how similar. Plain English.' },
    email_subject: { type: 'string', description: "Short, personal, non-spammy subject line for the delivery email, e.g. 'Your home value report for 12 Main St'. No ALL CAPS, no exclamation points." },
    email_preview: { type: 'string', description: 'One-sentence email preheader summarizing the report warmly.' },
  },
  required: ['intro', 'value_context', 'market_snapshot', 'comps_note', 'email_subject', 'email_preview'],
} as const

const SYSTEM_PROMPT = `You write home-valuation report copy for Proven Realty, a real estate team brokered by eXp Realty in western North Dakota (Williston / the Bakken region).

Voice: warm, plain-English, local, and honest — a neighbor who knows the market, not a salesperson. Absolute rules:
- Use ONLY the numbers provided. Never invent stats, trends, or facts about the home or market.
- Never promise a sale price or outcome. This is an estimate, not an appraisal — the copy may acknowledge that naturally.
- No clichés ("now more than ever", "in today's market", "hidden gem"), no urgency pressure, no exclamation points.
- Keep every section short. Homeowners skim.
Return only the structured object.`

function buildUserPrompt(ctx: NarrativeContext): string {
  const p = ctx.property
  const lines = [
    `Homeowner first name: ${ctx.firstName ?? 'unknown'}`,
    `Property: ${ctx.address}`,
    `Estimated value range: ${formatMoney(ctx.range.low)} to ${formatMoney(ctx.range.high)} (best estimate ${formatMoney(ctx.range.best)}, confidence ${ctx.range.confidence})`,
    p.beds || p.baths || p.sqft
      ? `Home facts: ${[p.beds && `${p.beds} bed`, p.baths && `${p.baths} bath`, p.sqft && `${p.sqft.toLocaleString()} sqft`, p.yearBuilt && `built ${p.yearBuilt}`].filter(Boolean).join(', ')}`
      : 'Home facts: not on record',
    p.lastSalePrice ? `Last sale: ${formatMoney(p.lastSalePrice)}${p.lastSaleDate ? ` on ${p.lastSaleDate.slice(0, 10)}` : ''}` : null,
    ctx.market?.medianPrice
      ? `Local market (zip level): median price ${formatMoney(ctx.market.medianPrice)}${ctx.market.averageDaysOnMarket ? `, avg ${Math.round(ctx.market.averageDaysOnMarket)} days on market` : ''}${ctx.market.totalListings ? `, ${ctx.market.totalListings} active listings` : ''}`
      : 'Local market stats: not available',
    `Comparable sales (${ctx.comps.length}):`,
    ...ctx.comps.slice(0, 8).map((c) =>
      `- ${c.address}: ${formatMoney(c.price)}${c.sqft ? `, ${c.sqft.toLocaleString()} sqft` : ''}${c.distance_mi != null ? `, ${c.distance_mi.toFixed(1)} mi away` : ''}`,
    ),
  ].filter(Boolean)
  return `Write the report narrative for this home.\n\n${lines.join('\n')}`
}

export async function generateNarrative(
  client: Anthropic,
  ctx: NarrativeContext,
): Promise<ReportNarrative> {
  const res = await client.messages.create({
    model: VALUATION_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: NARRATIVE_SCHEMA } },
    messages: [{ role: 'user', content: buildUserPrompt(ctx) }],
  } as Anthropic.MessageCreateParamsNonStreaming)

  if (res.stop_reason === 'refusal') throw new Error('narrative generation refused')
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return JSON.parse(text) as ReportNarrative
}
