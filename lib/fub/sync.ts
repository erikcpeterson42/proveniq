import { createAdminClient } from '@/lib/supabase/admin'
import { FubClient, type FubPage } from './client'
import { mapPerson, mapEvent, mapCall, mapNote, mapText } from './map'
import type { FubPerson, LeadEventRow } from './types'

const PAGE = 100
const CUTOFF_DAYS = 365
type Db = ReturnType<typeof createAdminClient>

// Collections that CAN be listed in bulk (newest-first, cursor paginated).
// Text messages are excluded here: FUB requires a personId filter, so those
// are fetched per-lead (see syncTextsForLeads).
const ACTIVITY = [
  { phase: 'events', path: '/events', key: 'events', map: mapEvent, maxPages: 300 },
  { phase: 'calls', path: '/calls', key: 'calls', map: mapCall, maxPages: 300 },
  { phase: 'notes', path: '/notes', key: 'notes', map: mapNote, maxPages: 150 },
] as const

export interface SyncResult {
  done: boolean
  phase: string
  counts: Record<string, number>
}

// --- sync_state helpers ---
async function loadState(db: Db, key: string): Promise<Record<string, unknown>> {
  const { data } = await db.from('sync_state').select('value').eq('key', key).maybeSingle()
  return (data?.value as Record<string, unknown>) ?? {}
}
async function saveState(db: Db, key: string, value: Record<string, unknown>) {
  await db.from('sync_state').upsert({ key, value })
}

async function loadLeadIds(db: Db): Promise<Set<number>> {
  const ids = new Set<number>()
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await db.from('leads').select('id').range(from, from + size - 1)
    if (error) throw new Error('loadLeadIds: ' + error.message)
    if (!data?.length) break
    for (const r of data) ids.add(r.id as number)
    if (data.length < size) break
  }
  return ids
}

async function insertEvents(db: Db, rows: LeadEventRow[], known: Set<number>): Promise<number> {
  const valid = rows.filter((r) => known.has(r.lead_id))
  if (!valid.length) return 0
  // Dedup within the batch by (source_kind, fub_id).
  const byKey = new Map<string, LeadEventRow>()
  for (const r of valid) byKey.set(`${r.source_kind}:${r.fub_id}`, r)
  const batch = [...byKey.values()]
  // Skip rows already stored. We can't use ON CONFLICT here: the unique index
  // on (source_kind, fub_id) is partial (WHERE fub_id IS NOT NULL) and
  // supabase-js/PostgREST can't target a partial index. A plain insert of an
  // existing row would still violate that index, so we filter first. This
  // keeps the sync idempotent across resumed chunks and full re-runs.
  const ids = batch.map((r) => r.fub_id)
  const existing = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from('lead_events').select('source_kind,fub_id').in('fub_id', ids.slice(i, i + 200))
    if (error) throw new Error('lead_events dedup: ' + error.message)
    for (const e of data ?? []) existing.add(`${e.source_kind}:${e.fub_id}`)
  }
  const fresh = batch.filter((r) => !existing.has(`${r.source_kind}:${r.fub_id}`))
  if (!fresh.length) return 0
  const { error } = await db.from('lead_events').insert(fresh)
  if (error) throw new Error('lead_events insert: ' + error.message)
  return fresh.length
}

function cutoffIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function nextPhase(phase: string): string {
  const idx = ACTIVITY.findIndex((a) => a.phase === phase)
  if (idx >= 0 && idx < ACTIVITY.length - 1) return ACTIVITY[idx + 1].phase
  return 'derive'
}

/**
 * Full sync: all people, then recent (<= CUTOFF_DAYS) events/calls/notes,
 * newest-first via cursor pagination. Resumable — persists {phase,next}
 * after every page. Processes up to `maxPages` pages per call.
 */
export async function fullSync({ maxPages = 1000 }: { maxPages?: number } = {}): Promise<SyncResult> {
  const db = createAdminClient()
  const fub = new FubClient()
  const state = await loadState(db, 'full_sync')

  let phase = (state.phase as string) ?? 'people'
  let next = (state.next as string | null) ?? null
  const phasePages = (state.phasePages as Record<string, number>) ?? {}
  const counts = (state.counts as Record<string, number>) ?? {}
  const cutoff = cutoffIso(CUTOFF_DAYS)
  let known: Set<number> | null = null
  let pages = 0

  const save = () =>
    saveState(db, 'full_sync', { phase, next, phasePages, counts, updatedAt: new Date().toISOString() })

  while (pages < maxPages && phase !== 'done') {
    if (phase === 'people') {
      const now = new Date().toISOString()
      const { items, metadata } = await fub.getPage<FubPerson>('/people', 'people', {
        limit: PAGE, sort: 'id', includeTrash: false, next: next ?? undefined,
      })
      if (items.length) {
        const { error } = await db.from('leads').upsert(items.map((p) => mapPerson(p, now)))
        if (error) throw new Error('leads upsert: ' + error.message)
        counts.people = (counts.people ?? 0) + items.length
      }
      pages++
      next = metadata.next ?? null
      if (!next || items.length < PAGE) { phase = ACTIVITY[0].phase; next = null }
      await save()
      continue
    }

    const def = ACTIVITY.find((a) => a.phase === phase)
    if (def) {
      if (!known) known = await loadLeadIds(db)
      try {
        const { items, metadata } = await fub.getPage<Record<string, unknown>>(def.path, def.key, {
          limit: PAGE, sort: '-created', next: next ?? undefined,
        })
        const rows = items
          .map((it) => def.map(it as never))
          .filter((r): r is LeadEventRow => r !== null && r.occurred_at >= cutoff)
        counts[def.phase] = (counts[def.phase] ?? 0) + (await insertEvents(db, rows, known))
        phasePages[def.phase] = (phasePages[def.phase] ?? 0) + 1
        next = metadata.next ?? null
        const reachedCutoff = items.some((it) => String((it as { created?: string }).created ?? '') < cutoff)
        if (!next || items.length < PAGE || phasePages[def.phase] >= def.maxPages || reachedCutoff) {
          phase = nextPhase(def.phase); next = null
        }
      } catch (e) {
        console.error(`[sync] ${def.phase} failed:`, (e as Error).message)
        counts[`${def.phase}_error`] = 1
        phase = nextPhase(def.phase); next = null
      }
      pages++
      await save()
      continue
    }

    if (phase === 'derive') {
      await db.rpc('recompute_lead_touch')
      phase = 'done'
      await save()
    }
  }

  return { done: phase === 'done', phase, counts }
}

/**
 * Incremental (nightly): people changed since watermark, recent activity
 * since watermark, per-lead texts for the changed leads, then recompute.
 */
export async function incrementalSync(): Promise<SyncResult> {
  const db = createAdminClient()
  const fub = new FubClient()
  const state = await loadState(db, 'incremental_sync')
  const watermark = (state.watermark as string) ?? cutoffIso(CUTOFF_DAYS)
  const counts: Record<string, number> = {}
  const changed = new Set<number>()
  let newWatermark = watermark

  // Changed people (newest-updated first; stop past the watermark).
  let next: string | null = null
  for (let page = 0; page < 100; page++) {
    const now = new Date().toISOString()
    const { items, metadata }: FubPage<FubPerson> = await fub.getPage<FubPerson>('/people', 'people', {
      limit: PAGE, sort: '-updated', includeTrash: false, next: next ?? undefined,
    })
    if (!items.length) break
    const fresh = items.filter((p) => (p.updated ?? '') > watermark)
    if (fresh.length) {
      const { error } = await db.from('leads').upsert(fresh.map((p) => mapPerson(p, now)))
      if (error) throw new Error('leads upsert: ' + error.message)
      counts.people = (counts.people ?? 0) + fresh.length
      for (const p of fresh) {
        changed.add(p.id)
        if ((p.updated ?? '') > newWatermark) newWatermark = p.updated!
      }
    }
    next = metadata.next ?? null
    if (fresh.length < items.length || !next) break
  }

  const known = await loadLeadIds(db)

  // Recent bulk activity since the watermark.
  for (const def of ACTIVITY) {
    let cur: string | null = null
    for (let page = 0; page < def.maxPages; page++) {
      const { items, metadata }: FubPage<Record<string, unknown>> = await fub.getPage<Record<string, unknown>>(def.path, def.key, {
        limit: PAGE, sort: '-created', next: cur ?? undefined,
      })
      if (!items.length) break
      const rows = items
        .map((it) => def.map(it as never))
        .filter((r): r is LeadEventRow => r !== null && r.occurred_at > watermark)
      counts[def.phase] = (counts[def.phase] ?? 0) + (await insertEvents(db, rows, known))
      cur = metadata.next ?? null
      if (rows.length < items.length || !cur) break
    }
  }

  // Per-lead texts for the leads that changed tonight.
  counts.texts = await syncTextsForLeads(db, fub, [...changed], known, watermark)

  await db.rpc('recompute_lead_touch')
  await saveState(db, 'incremental_sync', {
    watermark: newWatermark, counts, finishedAt: new Date().toISOString(),
  })
  return { done: true, phase: 'done', counts }
}

// Fetch text messages for specific leads (FUB requires a personId filter).
export async function syncTextsForLeads(
  db: Db, fub: FubClient, ids: number[], known: Set<number>, sinceIso: string,
): Promise<number> {
  let inserted = 0
  for (const id of ids) {
    try {
      const { items } = await fub.getPage<Record<string, unknown>>('/textMessages', 'textMessages', {
        personId: id, limit: PAGE,
      })
      const rows = items
        .map((it) => mapText(it as never))
        .filter((r): r is LeadEventRow => r !== null && r.occurred_at >= sinceIso)
      inserted += await insertEvents(db, rows, known)
    } catch {
      // skip a lead that errors; keep going
    }
  }
  return inserted
}

export async function resetFullSync() {
  await saveState(createAdminClient(), 'full_sync', {})
}
