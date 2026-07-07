import Anthropic from '@anthropic-ai/sdk'

// The single server-side gateway to the Anthropic API. Per CLAUDE.md, Claude
// is NEVER called from the browser — only from route handlers, cron jobs, and
// server actions. Keep the key in env; never expose it client-side.
export function createAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  return new Anthropic({ apiKey })
}

// Use the latest, most capable model for AI analysis (CLAUDE.md).
export const SCRIPT_MODEL = 'claude-opus-4-8'
