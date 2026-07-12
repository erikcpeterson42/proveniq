import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { loadReportByToken } from '@/lib/reports/report'
import ReportView from '../ReportView'
import OpenBeacon from './OpenBeacon'

export const dynamic = 'force-dynamic'

// The client-facing valuation report. Public by unguessable token — no login.
// Also serves as the agent preview for held reports (opens aren't counted
// until the report is actually sent; see the open route).

interface Props {
  params: { token: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const report = await loadReportByToken(params.token)
  return {
    title: report?.address_formatted
      ? `Home Value Report — ${report.address_formatted}`
      : 'Home Value Report — Proven Realty',
    robots: { index: false, follow: false }, // private link, keep out of Google
  }
}

export default async function ReportPage({ params }: Props) {
  const report = await loadReportByToken(params.token)
  if (!report || !['sent', 'held'].includes(report.status)) notFound()
  if (report.value_low == null || report.value_high == null || report.value_best == null) notFound()

  return (
    <>
      <OpenBeacon token={report.token} />
      <ReportView report={report} />
    </>
  )
}
