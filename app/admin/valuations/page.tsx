import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { usageSummary } from '@/lib/rentcast/budget'
import { formatMoney } from '@/lib/valuation/range'
import { approveAndSend, dismissReport } from './actions'

export const dynamic = 'force-dynamic'

// Deal Radar review queue: held valuation reports waiting on a human, plus
// recently sent reports with their open counts (the engagement signal).

interface Row {
  token: string
  lead_id: number
  status: string
  hold_reason: string | null
  address_formatted: string | null
  value_low: number | null
  value_high: number | null
  confidence: string | null
  zillow_url: string | null
  listing: { office?: string; price?: number } | null
  error: string | null
  created_at: string
  sent_at: string | null
  open_count: number
  leads: { name: string | null; email: string | null } | null
}

const COLS =
  'token, lead_id, status, hold_reason, address_formatted, value_low, value_high, ' +
  'confidence, zillow_url, listing, error, created_at, sent_at, open_count, leads(name, email)'

const HOLD_LABEL: Record<string, string> = {
  address_only: 'No seller tag — confirm before sending',
  listed_elsewhere: 'Already listed with another brokerage — do NOT email; match to buyers',
  thin_data: 'Thin comp data — check the numbers first',
  no_email: 'No email on file — add one in FUB, then approve',
}

function range(r: Row): string {
  return r.value_low != null && r.value_high != null
    ? `${formatMoney(r.value_low)} – ${formatMoney(r.value_high)}`
    : 'no value'
}

const fubUrl = (id: number) => `https://app.followupboss.com/2/people/view/${id}`

export default async function ValuationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const [{ data: heldData }, { data: sentData }, usage] = await Promise.all([
    db.from('valuation_reports').select(COLS)
      .eq('status', 'held').order('created_at', { ascending: false }).limit(50),
    db.from('valuation_reports').select(COLS)
      .eq('status', 'sent').gte('sent_at', since)
      .order('sent_at', { ascending: false }).limit(50),
    usageSummary(db),
  ])
  const held = (heldData ?? []) as unknown as Row[]
  const sent = (sentData ?? []) as unknown as Row[]

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-navy-800 bg-navy-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="font-serif text-xl">Deal Radar — valuation reports</h1>
            <p className="text-xs text-navy-200">
              RentCast usage this month: {usage.used}/{usage.budget} calls
            </p>
          </div>
          <Link href="/dashboard" className="text-sm text-azure-300 hover:text-azure-200">
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-8">
        <section>
          <h2 className="font-serif text-lg text-navy-900">
            Waiting on you <span className="text-navy-400">({held.length})</span>
          </h2>
          <div className="mt-3 space-y-3">
            {held.length === 0 && (
              <p className="rounded-xl border border-navy-100 bg-white p-5 text-sm text-navy-400">
                Nothing to review — the pipeline is fully caught up.
              </p>
            )}
            {held.map((r) => (
              <div key={r.token} className="rounded-xl border border-navy-100 bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-navy-900">
                      {r.leads?.name ?? `Lead #${r.lead_id}`}
                      <span className="ml-2 font-serif text-navy-600">{range(r)}</span>
                      {r.confidence && (
                        <span className="ml-2 rounded-full bg-azure-100 px-2 py-0.5 text-[11px] font-semibold text-azure-700">
                          {r.confidence} confidence
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-navy-500">{r.address_formatted ?? 'address unknown'}</div>
                    <div className="mt-1 text-sm font-medium text-amber-700">
                      {HOLD_LABEL[r.hold_reason ?? ''] ?? 'Needs review'}
                      {r.listing?.office ? ` — listed with ${r.listing.office}${r.listing.price ? ` at ${formatMoney(r.listing.price)}` : ''}` : ''}
                    </div>
                    {r.error && <div className="mt-1 text-xs text-red-600">{r.error}</div>}
                    <div className="mt-2 flex gap-3 text-sm">
                      <a href={`/r/${r.token}`} target="_blank" className="text-azure-600 underline underline-offset-2">Preview report</a>
                      {r.zillow_url && (
                        <a href={r.zillow_url} target="_blank" rel="noopener noreferrer" className="text-azure-600 underline underline-offset-2">Zillow</a>
                      )}
                      <a href={fubUrl(r.lead_id)} target="_blank" rel="noopener noreferrer" className="text-azure-600 underline underline-offset-2">Open in FUB</a>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {r.hold_reason !== 'listed_elsewhere' && (
                      <form action={approveAndSend}>
                        <input type="hidden" name="token" value={r.token} />
                        <button
                          className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
                          disabled={!r.leads?.email}
                          title={r.leads?.email ? `Email ${r.leads.email}` : 'Lead has no email'}
                        >
                          Approve &amp; send
                        </button>
                      </form>
                    )}
                    <form action={dismissReport}>
                      <input type="hidden" name="token" value={r.token} />
                      <button className="rounded-lg border border-navy-200 px-4 py-2 text-sm font-semibold text-navy-600 hover:bg-navy-50">
                        Dismiss
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-serif text-lg text-navy-900">
            Sent in the last 14 days <span className="text-navy-400">({sent.length})</span>
          </h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-navy-100 bg-white shadow-card">
            {sent.length === 0 && (
              <p className="p-5 text-sm text-navy-400">No reports sent yet.</p>
            )}
            {sent.map((r, i) => (
              <div key={r.token} className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 ${i > 0 ? 'border-t border-navy-50' : ''}`}>
                <div className="min-w-0">
                  <span className="font-semibold text-navy-900">{r.leads?.name ?? `Lead #${r.lead_id}`}</span>
                  <span className="ml-2 text-sm text-navy-500">{r.address_formatted}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-serif text-navy-700">{range(r)}</span>
                  <span className={r.open_count > 0 ? 'font-semibold text-emerald-600' : 'text-navy-300'}>
                    {r.open_count > 0 ? `opened ×${r.open_count}` : 'not opened yet'}
                  </span>
                  <a href={`/r/${r.token}`} target="_blank" className="text-azure-600 underline underline-offset-2">view</a>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-navy-400">
            An &ldquo;opened&rdquo; report is a motivation signal — it feeds the nightly scoring run automatically.
          </p>
        </section>
      </main>
    </div>
  )
}
