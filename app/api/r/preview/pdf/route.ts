import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SAMPLE_REPORT } from '@/lib/reports/sample'
import { renderReportPdf } from '@/lib/reports/pdf'

export const runtime = 'nodejs'
export const maxDuration = 60

// PDF of the sample report — lets the team check the attachment design
// without generating a real report. Team-only in production.
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const pdf = await renderReportPdf(SAMPLE_REPORT)
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Proven-Realty-Value-Report-SAMPLE.pdf"',
      'Cache-Control': 'private, no-store',
    },
  })
}
