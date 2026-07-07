import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '../login/actions'

export const dynamic = 'force-dynamic'

// One row of the briefing: the score fields plus the embedded lead.
interface BriefingRow {
  lead_id: number
  score: number
  likelihood: number | null
  timeline_bucket: string | null
  best_contact_window: string | null
  next_action: string | null
  reasons: string[] | null
  is_hot: boolean
  is_gem: boolean
  is_overdue: boolean
  overdue_detail: string | null
  leads: {
    name: string | null
    phone: string | null
    email: string | null
    lead_type: 'buyer' | 'seller' | null
    city: string | null
    stage: string | null
  } | null
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('full_name, role, email').eq('id', user.id).single()
  const displayName = profile?.full_name || user.email
  const role = profile?.role ?? 'agent'

  // Most recent scoring run.
  const { data: latest } = await supabase
    .from('lead_scores').select('run_date').order('run_date', { ascending: false }).limit(1).maybeSingle()
  const runDate = latest?.run_date as string | undefined

  let rows: BriefingRow[] = []
  let hot = 0, gems = 0, overdue = 0
  if (runDate) {
    const [{ data: top }, hotRes, gemRes, odRes] = await Promise.all([
      supabase
        .from('lead_scores')
        .select(
          'lead_id, score, likelihood, timeline_bucket, best_contact_window, next_action, reasons, ' +
            'is_hot, is_gem, is_overdue, overdue_detail, leads(name, phone, email, lead_type, city, stage)',
        )
        .eq('run_date', runDate)
        .order('score', { ascending: false })
        .limit(25),
      supabase.from('lead_scores').select('*', { count: 'exact', head: true }).eq('run_date', runDate).eq('is_hot', true),
      supabase.from('lead_scores').select('*', { count: 'exact', head: true }).eq('run_date', runDate).eq('is_gem', true),
      supabase.from('lead_scores').select('*', { count: 'exact', head: true }).eq('run_date', runDate).eq('is_overdue', true),
    ])
    rows = (top ?? []) as unknown as BriefingRow[]
    hot = hotRes.count ?? 0
    gems = gemRes.count ?? 0
    overdue = odRes.count ?? 0
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-bold tracking-tight text-gray-900">ProvenIQ</span>
            <span className="text-sm text-gray-400">Daily Briefing</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{displayName}</p>
              <p className="text-xs capitalize text-gray-400">{role}</p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Today&apos;s Briefing</h1>
            <p className="mt-1 text-sm text-gray-500">
              The leads most worth contacting today, ranked by motivation to transact.
            </p>
          </div>
          {runDate && <span className="text-xs text-gray-400">Scored {runDate}</span>}
        </div>

        {!runDate ? (
          <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
            <p className="text-sm font-medium text-gray-500">No briefing yet.</p>
            <p className="mt-1 text-sm text-gray-400">
              Once the nightly scoring job runs, ranked leads will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-3 gap-4">
              <Stat label="Hot leads" value={hot} accent="text-red-600" />
              <Stat label="Seller gems" value={gems} accent="text-amber-600" />
              <Stat label="Overdue" value={overdue} accent="text-blue-600" />
            </div>

            <ol className="mt-8 space-y-3">
              {rows.map((row, i) => (
                <LeadCard key={row.lead_id} row={row} rank={i + 1} />
              ))}
            </ol>
          </>
        )}
      </main>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value.toLocaleString()}</p>
    </div>
  )
}

function LeadCard({ row, rank }: { row: BriefingRow; rank: number }) {
  const lead = row.leads
  const name = lead?.name || `Lead #${row.lead_id}`
  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
          {rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{name}</span>
            {lead?.lead_type && <Badge tone={lead.lead_type === 'seller' ? 'green' : 'sky'}>{lead.lead_type}</Badge>}
            {row.is_hot && <Badge tone="red">HOT</Badge>}
            {row.is_gem && <Badge tone="amber">GEM</Badge>}
            {row.is_overdue && <Badge tone="blue">OVERDUE</Badge>}
            {lead?.city && <span className="text-xs text-gray-400">{lead.city}</span>}
          </div>

          <p className="mt-1.5 text-sm font-medium text-gray-800">{row.next_action}</p>

          {row.reasons && row.reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.reasons.slice(0, 4).map((r, idx) => (
                <span key={idx} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{r}</span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
            {row.overdue_detail && <span className="text-blue-600">{row.overdue_detail}</span>}
            {row.timeline_bucket && <span>Timeline: {row.timeline_bucket} days</span>}
            {row.best_contact_window && <span>Best time: {row.best_contact_window}</span>}
            {lead?.phone && <span>{lead.phone}</span>}
            {lead?.email && <span className="truncate">{lead.email}</span>}
          </div>
        </div>

        <div className="flex-none text-right">
          <div className="text-2xl font-bold text-gray-900">{row.score}</div>
          {row.likelihood != null && <div className="text-xs text-gray-400">{row.likelihood}% likely</div>}
        </div>
      </div>
    </li>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'red' | 'amber' | 'blue' | 'green' | 'sky' }) {
  const tones: Record<string, string> = {
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    sky: 'bg-sky-100 text-sky-700',
  }
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  )
}
