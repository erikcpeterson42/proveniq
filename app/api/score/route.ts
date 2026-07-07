import { NextRequest, NextResponse } from 'next/server'
import { scoreAllLeads } from '@/lib/jobs/scoreLeads'

export const runtime = 'nodejs'
export const maxDuration = 60

// Only the nightly cron (which knows CRON_SECRET) may trigger scoring.
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
    const result = await scoreAllLeads()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
