import { NextRequest, NextResponse } from 'next/server'
import { valuateLeadById } from '@/lib/jobs/runValuations'

export const runtime = 'nodejs'
export const maxDuration = 120

// Manual valuation trigger (testing + one-offs):
//   POST /api/valuations?leadId=123          -> generate, park in review queue
//   POST /api/valuations?leadId=123&send=1   -> generate AND email the client
// Auth: CRON_SECRET, same as /api/score and /api/cron.
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
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const leadId = Number(req.nextUrl.searchParams.get('leadId'))
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: 'leadId query param required' }, { status: 400 })
  }
  const send = req.nextUrl.searchParams.get('send') === '1'
  try {
    const result = await valuateLeadById(leadId, { send })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
