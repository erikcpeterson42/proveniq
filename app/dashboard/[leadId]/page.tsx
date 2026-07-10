import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ScriptCard } from './ScriptCard'

export const dynamic = 'force-dynamic'

interface ScoreRow {
  score: number
  likelihood: number | null
  timeline_bucket: string | null
  best_contact_window: string | null
  next_action: string | null
  reasons: string[] | null
  motivation: string | null
  pain_points: string[] | null
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

interface ScriptRow {
  call_script: { framework?: string } | null
  text_script: string | null
  voicemail: string | null
  email_subject: string | null
  email_body: string | null
  objections: { objection: string; rebuttal: string }[] | null
}

export default async function LeadDetailPage({ params }: { params: { leadId: string } }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const leadId = Number(params.leadId)

  const { data: latest } = await supabase
    .from('lead_scores').select('run_date').eq('lead_id', leadId).order('run_date', { ascending: false }).limit(1).maybeSingle()
  const runDate = latest?.run_date as string | undefined

  let score: ScoreRow | null = null
  let scripts: ScriptRow | null = null
  if (runDate) {
    const [{ data: s }, { data: sc }] = await Promise.all([
      supabase
        .from('lead_scores')
        .select(
          'score, likelihood, timeline_bucket, best_contact_window, next_action, reasons, motivation, pain_points, ' +
            'is_hot, is_gem, is_overdue, overdue_detail, leads(name, phone, email, lead_type, city, stage)',
        )
        .eq('lead_id', leadId).eq('run_date', runDate).maybeSingle(),
      supabase
        .from('lead_scripts')
        .select('call_script, text_script, voicemail, email_subject, email_body, objections')
        .eq('lead_id', leadId).eq('run_date', runDate).maybeSingle(),
    ])
    score = (s as unknown as ScoreRow) ?? null
    scripts = (sc as unknown as ScriptRow) ?? null
  }

  const lead = score?.leads
  const name = lead?.name || `Lead #${leadId}`

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-navy-800 bg-navy-900 text-white shadow-lg">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3.5">
          <Link href="/dashboard" className="text-sm font-medium text-navy-100 transition hover:text-azure-300">
            ← Back to briefing
          </Link>
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-azure-500 font-serif text-sm font-bold text-navy-900">P</span>
            <span className="font-serif text-lg tracking-tight">ProvenIQ</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {!score ? (
          <p className="text-sm text-navy-500">No scored data for this lead yet.</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-serif text-3xl tracking-tight text-navy-900">{name}</h1>
                  {lead?.lead_type && <Badge tone={lead.lead_type === 'seller' ? 'emerald' : 'navy'}>{lead.lead_type}</Badge>}
                  {score.is_hot && <Badge tone="rose">HOT</Badge>}
                  {score.is_gem && <Badge tone="azure">GEM</Badge>}
                  {score.is_overdue && <Badge tone="amber">OVERDUE</Badge>}
                </div>
                <p className="mt-1.5 text-sm text-navy-500">
                  {[lead?.stage, lead?.city].filter(Boolean).join(' · ') || 'No stage on record'}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-navy-600">
                  {lead?.phone && <span>{lead.phone}</span>}
                  {lead?.email && <span>{lead.email}</span>}
                  {score.best_contact_window && <span className="text-navy-500">Best time: {score.best_contact_window}</span>}
                </div>
              </div>
              <div className="flex-none text-center">
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-2xl font-serif text-2xl font-bold text-white ${
                    score.is_hot ? 'bg-navy-900 ring-2 ring-azure-500 ring-offset-2 ring-offset-canvas' : 'bg-navy-900'
                  }`}
                >
                  {score.score}
                </div>
                {score.likelihood != null && <div className="mt-1 text-[11px] font-medium text-navy-500">{score.likelihood}% likely</div>}
                {score.timeline_bucket && <div className="text-[11px] text-navy-400">~{score.timeline_bucket} days</div>}
              </div>
            </div>

            {score.next_action && (
              <div className="mt-5 rounded-2xl bg-navy-900 p-4 text-white shadow-card">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-azure-300">Next action</p>
                <p className="mt-1 text-sm font-medium leading-relaxed">{score.next_action}</p>
              </div>
            )}

            {score.overdue_detail && <p className="mt-3 text-sm font-medium text-amber-700">{score.overdue_detail}</p>}

            {score.motivation && (
              <Section title="Motivation">
                <p className="text-sm leading-relaxed text-navy-700">{score.motivation}</p>
              </Section>
            )}

            {score.reasons && score.reasons.length > 0 && (
              <Section title="Why they're here">
                <ul className="list-disc space-y-1 pl-5 text-sm text-navy-700">
                  {score.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </Section>
            )}

            {score.pain_points && score.pain_points.length > 0 && (
              <Section title="Likely pain points">
                <ul className="list-disc space-y-1 pl-5 text-sm text-navy-700">
                  {score.pain_points.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </Section>
            )}

            <h2 className="mt-10 font-serif text-xl text-navy-900">Outreach scripts</h2>
            {!scripts ? (
              <p className="mt-2 text-sm text-navy-400">
                Scripts haven&apos;t been generated for this lead yet — the nightly job writes them for the top leads.
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {scripts.call_script?.framework && <ScriptCard title="Call framework" body={scripts.call_script.framework} />}
                {scripts.text_script && <ScriptCard title="Text message" body={scripts.text_script} />}
                {scripts.voicemail && <ScriptCard title="Voicemail" body={scripts.voicemail} />}
                {(scripts.email_subject || scripts.email_body) && (
                  <ScriptCard title="Email" body={`Subject: ${scripts.email_subject ?? ''}\n\n${scripts.email_body ?? ''}`} />
                )}
                {scripts.objections && scripts.objections.length > 0 && (
                  <div className="rounded-2xl border border-navy-100 bg-white p-5 shadow-card">
                    <h3 className="font-serif text-base text-navy-900">Objections &amp; rebuttals</h3>
                    <dl className="mt-3 space-y-3">
                      {scripts.objections.map((o, i) => (
                        <div key={i} className="border-l-2 border-azure-400 pl-3">
                          <dt className="text-sm font-medium text-navy-900">“{o.objection}”</dt>
                          <dd className="mt-0.5 text-sm text-navy-600">{o.rebuttal}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-navy-400">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
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
