import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { runIncremental, runFullChunk } from './actions'

export const dynamic = 'force-dynamic'

export default async function SyncAdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-gray-500">Admins only.</p>
      </main>
    )
  }

  const [{ count: leadCount }, { count: eventCount }, full, incr] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    supabase.from('lead_events').select('*', { count: 'exact', head: true }),
    supabase.from('sync_state').select('value').eq('key', 'full_sync').maybeSingle(),
    supabase.from('sync_state').select('value').eq('key', 'incremental_sync').maybeSingle(),
  ])

  const fullState = (full.data?.value ?? {}) as Record<string, unknown>
  const fullCursor = (fullState.cursor as { phase?: string } | undefined) ?? undefined
  const fullCounts = (fullState.counts as Record<string, number> | undefined) ?? {}
  const incrState = (incr.data?.value ?? {}) as Record<string, unknown>

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">FUB Sync</h1>
      <p className="mt-1 text-sm text-gray-500">
        Pull leads and activity from Follow Up Boss into ProvenIQ.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <Stat label="Leads" value={leadCount ?? 0} />
        <Stat label="Lead events" value={eventCount ?? 0} />
      </div>

      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Full sync</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pulls every person, then all activity. Resumable — click Continue
          until it reports <span className="font-medium">done</span>.
        </p>
        <p className="mt-3 text-sm">
          Phase:{' '}
          <span className="font-mono font-medium text-gray-900">
            {fullCursor?.phase ?? 'not started'}
          </span>
        </p>
        {Object.keys(fullCounts).length > 0 && (
          <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
            {JSON.stringify(fullCounts, null, 2)}
          </pre>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={runFullChunk}>
            <button className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
              {fullCursor?.phase && fullCursor.phase !== 'done'
                ? 'Continue full sync'
                : 'Start full sync'}
            </button>
          </form>
          <form action={runFullChunk}>
            <input type="hidden" name="reset" value="1" />
            <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Restart from scratch
            </button>
          </form>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Incremental sync</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pulls only what changed since the last run. This is the nightly job.
        </p>
        {incrState.finishedAt ? (
          <p className="mt-2 text-xs text-gray-400">
            Last run: {String(incrState.finishedAt)}
          </p>
        ) : null}
        <form action={runIncremental} className="mt-4">
          <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Run incremental sync
          </button>
        </form>
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {value.toLocaleString()}
      </p>
    </div>
  )
}
