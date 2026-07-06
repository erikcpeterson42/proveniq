import { createClient } from '@supabase/supabase-js'

// Service-role Supabase client. Bypasses Row Level Security, so this
// may ONLY be used in trusted server code (cron jobs, sync, scoring).
// Never import this into a Client Component or expose it to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
