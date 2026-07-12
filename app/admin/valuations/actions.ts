'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendValuationEmail } from '@/lib/jobs/sendValuationEmail'

// Any signed-in team member can approve or dismiss a held report — approving
// is exactly the agent-review step the held statuses exist for.
async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
}

export async function approveAndSend(formData: FormData) {
  await requireUser()
  const token = String(formData.get('token') ?? '')
  const result = await sendValuationEmail(token)
  if (!result.sent) {
    // Leave the report held; the page shows the stored error/skip reason.
    console.error('[valuations] approve failed:', result.skipped)
  }
  revalidatePath('/admin/valuations')
}

export async function dismissReport(formData: FormData) {
  await requireUser()
  const token = String(formData.get('token') ?? '')
  if (!/^[0-9a-f]{32}$/.test(token)) throw new Error('bad token')
  const db = createAdminClient()
  await db.from('valuation_reports')
    .update({ status: 'skipped' }).eq('token', token).eq('status', 'held')
  revalidatePath('/admin/valuations')
}
