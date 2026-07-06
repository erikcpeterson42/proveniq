import type { FubMetadata } from './types'

// The single, rate-limited gateway to the Follow Up Boss API.
// Nothing else in the app should call FUB directly (see CLAUDE.md).

const BASE_URL = 'https://api.followupboss.com/v1'

type QueryValue = string | number | boolean | undefined
type Query = Record<string, QueryValue>

export interface FubPage<T> {
  items: T[]
  metadata: FubMetadata
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface FubClientOptions {
  apiKey?: string
  system?: string
  systemKey?: string
  maxConcurrency?: number
}

export class FubClient {
  private authHeader: string
  private system?: string
  private systemKey?: string

  // Concurrency gate (cap parallel requests — default 2 per CLAUDE.md).
  private maxConcurrency: number
  private active = 0
  private waiters: Array<() => void> = []

  constructor(opts: FubClientOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.FUB_API_KEY
    if (!apiKey) throw new Error('FUB_API_KEY is not set')
    // Basic auth: API key as username, blank password.
    this.authHeader =
      'Basic ' + Buffer.from(`${apiKey}:`).toString('base64')
    this.system = opts.system ?? process.env.FUB_X_SYSTEM
    this.systemKey = opts.systemKey ?? process.env.FUB_X_SYSTEM_KEY
    this.maxConcurrency = opts.maxConcurrency ?? 2
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: 'application/json',
    }
    if (this.system) h['X-System'] = this.system
    if (this.systemKey) h['X-System-Key'] = this.systemKey
    return h
  }

  // --- concurrency gate: hands a slot directly to the next waiter so we
  // never briefly exceed maxConcurrency ---
  private async acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active++
      return
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
  }

  private release(): void {
    const next = this.waiters.shift()
    if (next) next() // transfer the slot; active count stays the same
    else this.active--
  }

  // Core request with rate-limit awareness and 429 backoff + jitter.
  private async doRequest<T>(path: string, query?: Query): Promise<T> {
    const url = new URL(BASE_URL + path)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v))
      }
    }

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: this.headers() })

      if (res.status === 429) {
        if (attempt >= 6) {
          throw new Error(`FUB rate limit: gave up after ${attempt} retries`)
        }
        const retryAfter = Number(res.headers.get('Retry-After')) || 10
        const jitter = 250 + Math.floor((attempt + 1) * 400)
        await sleep(retryAfter * 1000 + jitter)
        continue
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(
          `FUB ${res.status} on ${path}: ${body.slice(0, 300)}`,
        )
      }

      // Proactively slow down as we approach the window limit.
      const remaining = Number(res.headers.get('X-RateLimit-Remaining'))
      const data = (await res.json()) as T
      if (!Number.isNaN(remaining) && remaining <= 3) {
        await sleep(1500)
      }
      return data
    }
  }

  async request<T>(path: string, query?: Query): Promise<T> {
    await this.acquire()
    try {
      return await this.doRequest<T>(path, query)
    } finally {
      this.release()
    }
  }

  // Fetch one page of a collection endpoint. Returns the items array and
  // the _metadata block. Falls back to the first array field if the
  // collection key differs from what we expect.
  async getPage<T>(
    path: string,
    collectionKey: string,
    query?: Query,
  ): Promise<FubPage<T>> {
    const res = await this.request<Record<string, unknown>>(path, query)
    let items = res[collectionKey] as T[] | undefined
    if (!Array.isArray(items)) {
      const firstArray = Object.entries(res).find(
        ([k, v]) => k !== '_metadata' && Array.isArray(v),
      )
      items = (firstArray?.[1] as T[]) ?? []
    }
    const metadata = (res._metadata as FubMetadata) ?? {}
    return { items, metadata }
  }
}
