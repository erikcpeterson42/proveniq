import { NextRequest, NextResponse } from 'next/server'
import { fullSync, incrementalSync, resetFullSync } from '@/lib/fub/sync'

export const runtime = 'nodejs'
export const maxDuration = 60

// Only the nightly cron (which knows CRON_SECRET) may call this.
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

  const params = new URL(req.url).searchParams
  const mode = params.get('mode') ?? 'incremental'

  try {
    if (mode === 'full') {
      if (params.get('reset') === '1') await resetFullSync()
      // Bounded chunk so the function fits inside its time limit; the caller
      // re-POSTs while `done` is false until the full sync completes.
      const chunk = Math.min(Number(params.get('pages')) || 25, 500)
      const result = await fullSync({ maxPages: chunk })
      return NextResponse.json(result)
    }
    const result = await incrementalSync()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
