import { NextRequest, NextResponse } from 'next/server'
import { loadReportByToken } from '@/lib/reports/report'
import { renderReportPdf } from '@/lib/reports/pdf'

export const runtime = 'nodejs'
export const maxDuration = 60

// "Download this report as a PDF" on the public report page. Same token
// guard as the page itself; only sent/held reports render.
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const report = await loadReportByToken(params.token)
  if (!report || !['sent', 'held'].includes(report.status)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const pdf = await renderReportPdf(report)
  const slug = (report.address_street ?? 'home-value-report')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Proven-Realty-Value-Report-${slug}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
