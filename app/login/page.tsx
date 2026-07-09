import { login } from './actions'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const error = searchParams?.error

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-navy-100 bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500 font-serif text-2xl font-bold text-navy-900">
            P
          </span>
          <h1 className="font-serif text-2xl tracking-tight text-navy-900">ProvenIQ</h1>
          <p className="mt-1 text-sm text-navy-500">Proven Realty team sign in</p>
        </div>

        {error ? (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <form action={login} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-navy-700">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm text-navy-900 outline-none transition focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-navy-700">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm text-navy-900 outline-none transition focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900 transition hover:bg-gold-600"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-navy-400">
          Access is invite-only. Contact your admin for an account.
        </p>
      </div>
    </main>
  )
}
