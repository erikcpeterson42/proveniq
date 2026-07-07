import { NextRequest, NextResponse } from 'next/server'
import { incrementalSync } from '@/lib/fub/sync'
import { scoreAllLeads } from '@/lib/jobs/scoreLeads'
import { generateScriptsForRun } from '@/lib/jobs/generateScripts'
import { sendDailyDigest } from '@/lib/jobs/sendDigest'

export const runtime = 'nodejs'
export const maxDuration = 300

// The nightly pipeline: pull what changed in FUB, re-score every lead,
// write fresh outreach scripts for the top leads, then email the digest.
// Vercel Cron calls this with `Authorization: Bearer <CRON_SECRET>`; manual
// runs can pass the same value as `x-cron-secret`.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  return header === secret
}

async function runPipeline() {
  const sync = await incrementalSync()
  const score = await scoreAllLeads()
  const scripts = await generateScriptsForRun()
  const digest = await sendDailyDigest()
  return { ok: true, sync, score, scripts, digest }
}

// Vercel Cron issues a GET. Support POST too for manual/local triggering.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await runPipeline())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
