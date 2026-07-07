// Claude-generated outreach scripts per lead. Server-side only (imports the
// Anthropic client). Uses structured outputs (output_config.format) so the
// model MUST return an object matching SCRIPT_SCHEMA — no brittle parsing.

import type Anthropic from '@anthropic-ai/sdk'
import { SCRIPT_MODEL } from '@/lib/anthropic/client'

// The context we hand Claude about a single lead. Deterministic scoring has
// already run; this is the qualitative layer on top.
export interface LeadContext {
  name: string
  lead_type: 'buyer' | 'seller' | null
  stage: string | null
  city: string | null
  tags: string[]
  score: number
  timeline_bucket: string
  best_contact_window: string | null
  overdue_detail: string | null
  reasons: string[]
  recent_activity: string[] // human-readable recent events, newest first
}

export interface ScriptBundle {
  motivation: string
  pain_points: string[]
  scripts: {
    call_framework: string
    text: string
    voicemail: string
    email_subject: string
    email_body: string
    objections: { objection: string; rebuttal: string }[]
  }
}

// JSON Schema for structured output. Every object sets additionalProperties:false
// and lists all keys in `required` (a structured-outputs requirement).
const SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    motivation: { type: 'string', description: "One sentence on why this lead is likely motivated to transact soon." },
    pain_points: { type: 'array', items: { type: 'string' }, description: '2-4 concrete pain points or needs this lead likely has.' },
    scripts: {
      type: 'object',
      additionalProperties: false,
      properties: {
        call_framework: { type: 'string', description: 'A short call opening + framework (bullet-style, 4-6 lines): how to open, what to ask, where to steer.' },
        text: { type: 'string', description: 'A single SMS under ~320 characters, warm and specific, ending with a low-friction question.' },
        voicemail: { type: 'string', description: 'A ~20-second voicemail (roughly 45-60 words).' },
        email_subject: { type: 'string', description: 'A short, non-spammy subject line.' },
        email_body: { type: 'string', description: 'A concise email (~100-150 words), personalized, with a clear single call to action.' },
        objections: {
          type: 'array',
          description: '2-3 likely objections, each with a brief rebuttal.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              objection: { type: 'string' },
              rebuttal: { type: 'string' },
            },
            required: ['objection', 'rebuttal'],
          },
        },
      },
      required: ['call_framework', 'text', 'voicemail', 'email_subject', 'email_body', 'objections'],
    },
  },
  required: ['motivation', 'pain_points', 'scripts'],
} as const

const SYSTEM_PROMPT = `You are an expert inside sales agent (ISA) writing personalized outreach for Proven Realty, a real estate team brokered by eXp Realty in western North Dakota (the Bakken region). Sellers are the team's primary focus.

Write outreach that is warm, concise, and genuinely helpful — never pushy, never spammy, no clichés ("Just checking in", "I wanted to reach out", "Hope this finds you well"). Sound like a real local agent who knows the market. Reference the lead's actual signals (what they viewed, their timeline, their tags) rather than generic filler. Favor a single clear call to action. Keep claims honest — do not invent facts about the lead or promise specific prices. Text and voicemail should be brief enough to actually send/leave. Return only the structured object.`

function buildUserPrompt(ctx: LeadContext): string {
  const lines = [
    `Lead: ${ctx.name}`,
    `Type: ${ctx.lead_type ?? 'unknown'}`,
    ctx.stage ? `CRM stage: ${ctx.stage}` : null,
    ctx.city ? `Location: ${ctx.city}` : null,
    ctx.tags.length ? `Tags: ${ctx.tags.slice(0, 12).join(', ')}` : null,
    `Motivation score: ${ctx.score}/100 (timeline ~${ctx.timeline_bucket} days)`,
    ctx.best_contact_window ? `Best time to reach: ${ctx.best_contact_window}` : null,
    ctx.overdue_detail ? `Urgency: ${ctx.overdue_detail}` : null,
    ctx.reasons.length ? `Why they're on the list:\n- ${ctx.reasons.join('\n- ')}` : null,
    ctx.recent_activity.length ? `Recent activity (newest first):\n- ${ctx.recent_activity.slice(0, 8).join('\n- ')}` : 'Recent activity: none on record',
  ].filter(Boolean)
  return `Write the outreach package for this lead.\n\n${lines.join('\n')}`
}

// Generate the full script bundle for one lead. Throws on API error so the
// caller can skip a lead without failing the whole run.
export async function generateScripts(client: Anthropic, ctx: LeadContext): Promise<ScriptBundle> {
  const res = await client.messages.create({
    model: SCRIPT_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    // Structured output + low effort: fast/cheap enough for a nightly batch,
    // and the schema constraint keeps output clean without prompt gymnastics.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCRIPT_SCHEMA } },
    messages: [{ role: 'user', content: buildUserPrompt(ctx) }],
  } as Anthropic.MessageCreateParamsNonStreaming)

  if (res.stop_reason === 'refusal') throw new Error('script generation refused')
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return JSON.parse(text) as ScriptBundle
}
