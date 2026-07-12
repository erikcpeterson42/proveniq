import { createAdminClient } from '@/lib/supabase/admin'

// Hard monthly budget for RentCast API calls. The free tier allows 50
// requests/month; we default to 45 to leave headroom for manual testing.
// Usage is tracked in sync_state under 'rentcast_usage' and resets when the
// calendar month changes.

type Db = ReturnType<typeof createAdminClient>

const KEY = 'rentcast_usage'

export function monthlyBudget(): number {
  const n = Number(process.env.RENTCAST_MONTHLY_BUDGET)
  return Number.isFinite(n) && n > 0 ? n : 45
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7) // e.g. "2026-07"
}

interface Usage {
  month: string
  used: number
}

async function loadUsage(db: Db): Promise<Usage> {
  const { data } = await db.from('sync_state').select('value').eq('key', KEY).maybeSingle()
  const v = (data?.value ?? {}) as Partial<Usage>
  const month = currentMonth()
  if (v.month !== month) return { month, used: 0 } // new month -> counter resets
  return { month, used: v.used ?? 0 }
}

async function saveUsage(db: Db, usage: Usage): Promise<void> {
  const { error } = await db.from('sync_state').upsert({ key: KEY, value: usage })
  if (error) throw new Error('rentcast budget save: ' + error.message)
}

/**
 * Try to reserve `calls` API requests from this month's budget.
 * Returns true (and records them) if they fit, false if the budget is spent.
 * Reserve BEFORE calling the RentCast client; refund what you didn't use.
 */
export async function reserveCalls(db: Db, calls: number): Promise<boolean> {
  const usage = await loadUsage(db)
  if (usage.used + calls > monthlyBudget()) return false
  await saveUsage(db, { ...usage, used: usage.used + calls })
  return true
}

/** Return unused reserved calls to the pool (e.g. lead skipped early). */
export async function refundCalls(db: Db, calls: number): Promise<void> {
  if (calls <= 0) return
  const usage = await loadUsage(db)
  await saveUsage(db, { ...usage, used: Math.max(0, usage.used - calls) })
}

/** For run reports and the admin screen: calls used / budget this month. */
export async function usageSummary(db: Db): Promise<{ used: number; budget: number }> {
  const usage = await loadUsage(db)
  return { used: usage.used, budget: monthlyBudget() }
}
