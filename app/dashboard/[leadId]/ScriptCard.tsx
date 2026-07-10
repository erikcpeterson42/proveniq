'use client'

import { useState } from 'react'

// A script block with a one-tap copy button, so agents can paste straight
// into Follow Up Boss / their texting app / email.
export function ScriptCard({ title, body }: { title: string; body: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked — no-op
    }
  }

  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-base text-navy-900">{title}</h3>
        <button
          type="button"
          onClick={copy}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
            copied
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-navy-200 text-navy-600 hover:border-azure-400 hover:text-azure-700'
          }`}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-navy-700">{body}</p>
    </div>
  )
}
