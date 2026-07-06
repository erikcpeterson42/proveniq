import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '../login/actions'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, email')
    .eq('id', user.id)
    .single()

  const displayName = profile?.full_name || user.email
  const role = profile?.role ?? 'agent'

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-bold tracking-tight text-gray-900">
              ProvenIQ
            </span>
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
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Today&apos;s Briefing
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Your ranked list of the leads most worth contacting today.
        </p>

        <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-sm font-medium text-gray-500">
            No briefing yet.
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Once the nightly scoring job runs, ranked leads and outreach
            scripts will appear here.
          </p>
        </div>
      </main>
    </div>
  )
}
