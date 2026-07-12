import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { SAMPLE_REPORT } from '@/lib/reports/sample'
import ReportView from '../ReportView'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Report template preview — ProvenIQ',
  robots: { index: false, follow: false },
}

// Sample-data preview of the valuation report template, so the team can
// check the design without burning a RentCast call. Team-only in production.

export default async function PreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')
  }
  return (
    <>
      <div className="bg-azure-500 px-4 py-2 text-center text-sm font-semibold text-white">
        Template preview with sample data — this is what clients receive
      </div>
      <ReportView report={SAMPLE_REPORT} />
    </>
  )
}
