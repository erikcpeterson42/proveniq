import { NextRequest, NextResponse } from 'next/server'
import { generateScriptsForRun } from '@/lib/jobs/generateScripts'

export const runtime = 'nodejs'
export const maxDuration = 300

// Only the nightly cron (which knows CRON_SECRET) may trigger script generation.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  return header === secret
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const limitParam = new URL(req.url).searchParams.get('limit')
    const limit = limitParam ? Math.max(1, Math.min(Number(limitParam), 100)) : undefined
    const result = await generateScriptsForRun(limit)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
