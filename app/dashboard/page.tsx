import Image from 'next/image'
import Link from 'next/link'
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

function prettyDate(iso?: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[(m ?? 1) - 1]} ${d}, ${y}`
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
        .eq('run_date', runDate).order('score', { ascending: false }).limit(25),
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-navy-800 bg-navy-900 text-white shadow-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="flex items-center rounded-lg bg-white px-2.5 py-1.5 shadow-sm">
              <Image
                src="/proven-logo.png"
                alt="Proven Realty, brokered by eXp"
                width={180}
                height={52}
                priority
                className="h-8 w-auto"
              />
            </span>
            <span className="hidden items-baseline gap-2 sm:flex">
              <span className="font-serif text-xl tracking-tight">ProvenIQ</span>
              <span className="text-xs font-medium uppercase tracking-widest text-azure-300">Daily Briefing</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-[11px] capitalize text-navy-300">{role}</p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-navy-600 px-3 py-1.5 text-sm font-medium text-navy-100 transition hover:border-azure-400 hover:text-azure-300"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl tracking-tight text-navy-900">Today&rsquo;s Briefing</h1>
            <p className="mt-1.5 text-sm text-navy-500">
              The leads most worth contacting today, ranked by motivation to transact.
            </p>
          </div>
          {runDate && (
            <span className="rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-medium text-navy-500 shadow-sm">
              Scored {prettyDate(runDate)}
            </span>
          )}
        </div>

        {!runDate ? (
          <div className="mt-8 rounded-2xl border border-dashed border-navy-200 bg-white p-12 text-center">
            <p className="text-sm font-medium text-navy-500">No briefing yet.</p>
            <p className="mt-1 text-sm text-navy-400">Once the nightly scoring job runs, ranked leads will appear here.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label="Hot leads" value={hot} sub="Drop everything" dot="bg-rose-500" />
              <Stat label="Seller gems" value={gems} sub="Your focus" dot="bg-azure-500" />
              <Stat label="Overdue" value={overdue} sub="Reach out today" dot="bg-amber-500" />
            </div>

            <div className="mt-8 flex items-center gap-2">
              <h2 className="font-serif text-lg text-navy-900">Your call list</h2>
              <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-600">Top {rows.length}</span>
            </div>
            <ol className="mt-3 space-y-2.5">
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

function Stat({ label, value, sub, dot }: { label: string; value: number; sub: string; dot: string }) {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">{label}</p>
      </div>
      <p className="mt-2 font-serif text-4xl font-medium text-navy-900">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs text-navy-400">{sub}</p>
    </div>
  )
}

function LeadCard({ row, rank }: { row: BriefingRow; rank: number }) {
  const lead = row.leads
  const name = lead?.name || `Lead #${row.lead_id}`
  const top3 = rank <= 3
  return (
    <li>
      <Link
        href={`/dashboard/${row.lead_id}`}
        className="group flex items-start gap-4 rounded-2xl border border-navy-100 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-azure-300 hover:shadow-lg"
      >
        <div
          className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-bold ${
            top3 ? 'bg-azure-100 text-azure-700 ring-1 ring-azure-300' : 'bg-navy-50 text-navy-500'
          }`}
        >
          {rank}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-navy-900">{name}</span>
            {lead?.lead_type && <Badge tone={lead.lead_type === 'seller' ? 'emerald' : 'navy'}>{lead.lead_type}</Badge>}
            {row.is_hot && <Badge tone="rose">HOT</Badge>}
            {row.is_gem && <Badge tone="azure">GEM</Badge>}
            {row.is_overdue && <Badge tone="amber">OVERDUE</Badge>}
            {lead?.city && <span className="text-xs text-navy-400">{lead.city}</span>}
          </div>

          <p className="mt-2 border-l-2 border-azure-400 pl-3 text-sm font-medium text-navy-800">{row.next_action}</p>

          {row.reasons && row.reasons.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {row.reasons.slice(0, 4).map((r, idx) => (
                <span key={idx} className="rounded-md bg-navy-50 px-2 py-0.5 text-xs text-navy-600">{r}</span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-navy-500">
            {row.overdue_detail && <span className="font-medium text-amber-700">{row.overdue_detail}</span>}
            {row.timeline_bucket && <span>Timeline: {row.timeline_bucket} days</span>}
            {row.best_contact_window && <span>Best time: {row.best_contact_window}</span>}
            {lead?.phone && <span>{lead.phone}</span>}
            {lead?.email && <span className="truncate">{lead.email}</span>}
          </div>
        </div>

        <div className="flex flex-none flex-col items-center gap-1">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl font-serif text-xl font-bold text-white ${
              row.is_hot ? 'bg-navy-900 ring-2 ring-azure-500 ring-offset-2 ring-offset-white' : 'bg-navy-900'
            }`}
          >
            {row.score}
          </div>
          {row.likelihood != null && <span className="text-[11px] font-medium text-navy-500">{row.likelihood}% likely</span>}
        </div>

        <span className="hidden self-center text-navy-300 transition group-hover:translate-x-0.5 group-hover:text-azure-500 sm:block">›</span>
      </Link>
    </li>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'rose' | 'azure' | 'amber' | 'emerald' | 'navy' }) {
  const tones: Record<string, string> = {
    rose: 'bg-rose-100 text-rose-700',
    azure: 'bg-azure-100 text-azure-700',
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    navy: 'bg-navy-100 text-navy-700',
  }
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  )
}
