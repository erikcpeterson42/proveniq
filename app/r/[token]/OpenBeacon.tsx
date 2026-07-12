'use client'

import { useEffect } from 'react'

// Fires once when the report actually renders in a browser, so opens are
// counted from real visits (email link-scanners don't execute JS).
export default function OpenBeacon({ token }: { token: string }) {
  useEffect(() => {
    fetch(`/api/r/${token}/open`, { method: 'POST' }).catch(() => {})
  }, [token])
  return null
}
