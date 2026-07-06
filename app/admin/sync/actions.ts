'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { fullSync, incrementalSync, resetFullSync } from '@/lib/fub/sync'

// Every action re-checks that the caller is an admin. This is the security
// boundary for the browser-triggered sync (the cron route uses CRON_SECRET).
async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Admins only')
}

export async function runIncremental() {
  await requireAdmin()
  await incrementalSync({})
  revalidatePath('/admin/sync')
}

// Processes a bounded chunk of the full sync, then returns. The page shows
// progress; click again to continue until it reports "done".
export async function runFullChunk(formData: FormData) {
  await requireAdmin()
  if (formData.get('reset') === '1') await resetFullSync()
  await fullSync({ maxPages: 30 })
  revalidatePath('/admin/sync')
}
