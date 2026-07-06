import { createAdminClient } from '@/lib/supabase/admin'
import { FubClient } from './client'
import {
  mapPerson, mapEvent, mapCall, mapText, mapNote, mapEmailEvent,
} from './map'
import type { FubPerson, LeadEventRow } from './types'

const PAGE = 100
type Db = ReturnType<typeof createAdminClient>

// Activity collections, processed in order after people. Each is wrapped in
// try/catch during the run so one unavailable endpoint can't fail the sync.
const ACTIVITY = [
  { phase: 'events', path: '/events', key: 'events', map: mapEvent },
  { phase: 'calls', path: '/calls', key: 'calls', map: mapCall },
  { phase: 'texts', path: '/textMessages', key: 'textMessages', map: mapText },
  { phase: 'notes', path: '/notes', key: 'notes', map: mapNote },
  { phase: 'emails', path: '/emEvents', key: 'emEvents', map: mapEmailEvent },
] as const

type Cursor = { phase: string; offset: number }
export interface SyncResult {
  done: boolean
  cursor: Cursor
  counts: Record<string, number>
}

// --- sync_state cursor helpers ---
async function loadState(db: Db, key: string): Promise<Record<string, unknown> | null> {
  const { data } = await db.from('sync_state').select('value').eq('key', key).maybeSingle()
  return (data?.value as Record<string, unknown>) ?? null
}
async function saveState(db: Db, key: string, value: Record<string, unknown>) {
  await db.from('sync_state').upsert({ key, value })
}

// Load every known lead id so we can skip activity for people we don't have
// (avoids foreign-key failures on trashed/excluded contacts).
async function loadLeadIds(db: Db): Promise<Set<number>> {
  const ids = new Set<number>()
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await db
      .from('leads').select('id').range(from, from + size - 1)
    if (error) throw new Error('loadLeadIds: ' + error.message)
    if (!data?.length) break
    for (const r of data) ids.add(r.id as number)
    if (data.length < size) break
  }
  return ids
}

async function insertEvents(db: Db, rows: LeadEventRow[], known: Set<number>) {
  const valid = rows.filter((r) => known.has(r.lead_id))
  if (!valid.length) return 0
  const { error } = await db
    .from('lead_events')
    .upsert(valid, { onConflict: 'source_kind,fub_id', ignoreDuplicates: true })
  if (error) throw new Error('lead_events upsert: ' + error.message)
  return valid.length
}

/**
 * Full sync: pages ALL people, then ALL activity, resumably. Persists a
 * cursor after every page. Processes at most `maxPages` pages per call and
 * returns { done:false } so a timeout-bound caller (Vercel) can loop.
 */
export async function fullSync({ maxPages = 1000 }: { maxPages?: number } = {}): Promise<SyncResult> {
  const db = createAdminClient()
  const fub = new FubClient()

  const state = (await loadState(db, 'full_sync')) ?? {}
  let cursor: Cursor = (state.cursor as Cursor) ?? { phase: 'people', offset: 0 }
  const counts: Record<string, number> = (state.counts as Record<string, number>) ?? {}
  let known: Set<number> | null = null
  let pages = 0

  while (pages < maxPages && cursor.phase !== 'done') {
    if (cursor.phase === 'people') {
      const now = new Date().toISOString()
      const { items, metadata } = await fub.getPage<FubPerson>('/people', 'people', {
        limit: PAGE, offset: cursor.offset, includeTrash: false, sort: 'id',
      })
      if (items.length) {
        const rows = items.map((p) => mapPerson(p, now))
        const { error } = await db.from('leads').upsert(rows)
        if (error) throw new Error('leads upsert: ' + error.message)
        counts.people = (counts.people ?? 0) + rows.length
      }
      pages++
      const nextOffset = cursor.offset + items.length
      const finished =
        items.length < PAGE ||
        (metadata.total !== undefined && nextOffset >= metadata.total)
      cursor = finished ? { phase: ACTIVITY[0].phase, offset: 0 } : { phase: 'people', offset: nextOffset }
      await saveState(db, 'full_sync', { cursor, counts, updatedAt: now })
      continue
    }

    const def = ACTIVITY.find((a) => a.phase === cursor.phase)
    if (def) {
      if (!known) known = await loadLeadIds(db)
      let finished = false
      try {
        const { items, metadata } = await fub.getPage<Record<string, unknown>>(
          def.path, def.key, { limit: PAGE, offset: cursor.offset },
        )
        const rows = items
          .map((it) => def.map(it as never))
          .filter((r): r is LeadEventRow => r !== null)
        const inserted = await insertEvents(db, rows, known)
        counts[def.phase] = (counts[def.phase] ?? 0) + inserted
        const nextOffset = cursor.offset + items.length
        finished =
          items.length < PAGE ||
          (metadata.total !== undefined && nextOffset >= metadata.total)
        cursor = finished ? { phase: nextPhase(def.phase), offset: 0 } : { phase: def.phase, offset: nextOffset }
      } catch (e) {
        // Endpoint unavailable (e.g. no emEvents access): log + skip on.
        counts[`${def.phase}_error`] = 1
        cursor = { phase: nextPhase(def.phase), offset: 0 }
      }
      pages++
      await saveState(db, 'full_sync', { cursor, counts, updatedAt: new Date().toISOString() })
      continue
    }

    if (cursor.phase === 'derive') {
      await db.rpc('recompute_lead_touch')
      cursor = { phase: 'done', offset: 0 }
      await saveState(db, 'full_sync', { cursor, counts, finishedAt: new Date().toISOString() })
    }
  }

  return { done: cursor.phase === 'done', cursor, counts }
}

function nextPhase(phase: string): string {
  const idx = ACTIVITY.findIndex((a) => a.phase === phase)
  if (idx >= 0 && idx < ACTIVITY.length - 1) return ACTIVITY[idx + 1].phase
  return 'derive'
}

/**
 * Incremental sync (nightly default): upsert people changed since the stored
 * watermark, pull recent activity, then recompute touch times.
 */
export async function incrementalSync({ maxPages = 50 }: { maxPages?: number } = {}): Promise<SyncResult> {
  const db = createAdminClient()
  const fub = new FubClient()
  const state = (await loadState(db, 'incremental_sync')) ?? {}
  const watermark = (state.watermark as string) ?? '1970-01-01T00:00:00Z'
  const counts: Record<string, number> = {}
  let newWatermark = watermark

  // People changed since last run (newest first; stop at watermark).
  for (let page = 0, offset = 0; page < maxPages; page++, offset += PAGE) {
    const now = new Date().toISOString()
    const { items } = await fub.getPage<FubPerson>('/people', 'people', {
      limit: PAGE, offset, sort: 'updated', includeTrash: false,
    })
    if (!items.length) break
    const fresh = items.filter((p) => (p.updated ?? '') > watermark)
    if (fresh.length) {
      const rows = fresh.map((p) => mapPerson(p, now))
      const { error } = await db.from('leads').upsert(rows)
      if (error) throw new Error('leads upsert: ' + error.message)
      counts.people = (counts.people ?? 0) + rows.length
      for (const p of fresh) if ((p.updated ?? '') > newWatermark) newWatermark = p.updated!
    }
    if (fresh.length < items.length) break // reached already-synced records
  }

  // Recent activity for all known leads (bounded pull, newest first).
  const known = await loadLeadIds(db)
  for (const def of ACTIVITY) {
    try {
      for (let page = 0, offset = 0; page < 5; page++, offset += PAGE) {
        const { items } = await fub.getPage<Record<string, unknown>>(def.path, def.key, {
          limit: PAGE, offset, sort: 'created',
        })
        if (!items.length) break
        const rows = items
          .map((it) => def.map(it as never))
          .filter((r): r is LeadEventRow => r !== null && (r.occurred_at ?? '') > watermark)
        counts[def.phase] = (counts[def.phase] ?? 0) + (await insertEvents(db, rows, known))
        if (rows.length < items.length) break
      }
    } catch {
      counts[`${def.phase}_error`] = 1
    }
  }

  await db.rpc('recompute_lead_touch')
  await saveState(db, 'incremental_sync', {
    watermark: newWatermark, counts, finishedAt: new Date().toISOString(),
  })
  return { done: true, cursor: { phase: 'done', offset: 0 }, counts }
}

// Clears the full-sync cursor so the next run starts fresh.
export async function resetFullSync() {
  const db = createAdminClient()
  await saveState(db, 'full_sync', {})
}
