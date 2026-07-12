import type {
  RentCastAvm,
  RentCastProperty,
  RentCastSaleListing,
  RentCastMarket,
} from './types'

// The single gateway to the RentCast API (property values, comps, listings).
// Free tier = 50 requests/MONTH, so every call is precious: the orchestrator
// must reserve budget via lib/rentcast/budget.ts before using this client.

const BASE_URL = 'https://api.rentcast.io/v1'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class RentCastClient {
  private apiKey: string
  /** Requests actually issued by this instance (for run reporting). */
  callsMade = 0

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.RENTCAST_API_KEY
    if (!key) throw new Error('RENTCAST_API_KEY is not set')
    this.apiKey = key
  }

  // Core GET. Returns null on 404 (RentCast's "no data for this address"),
  // retries once on 429/5xx, throws on anything else.
  private async get<T>(path: string, query: Record<string, string>): Promise<T | null> {
    const url = new URL(BASE_URL + path)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)

    for (let attempt = 0; ; attempt++) {
      this.callsMade++
      const res = await fetch(url, {
        headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
      })
      if (res.status === 404) return null
      if ((res.status === 429 || res.status >= 500) && attempt < 1) {
        await sleep(2000)
        continue
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`RentCast ${res.status} on ${path}: ${body.slice(0, 300)}`)
      }
      return (await res.json()) as T
    }
  }

  /** Automated valuation (value estimate + comparable sales). */
  async valueEstimate(address: string): Promise<RentCastAvm | null> {
    return this.get<RentCastAvm>('/avm/value', { address, compCount: '10' })
  }

  /** Public-record property details (beds/baths/sqft/last sale). */
  async propertyRecord(address: string): Promise<RentCastProperty | null> {
    const list = await this.get<RentCastProperty[]>('/properties', { address })
    return list?.[0] ?? null
  }

  /**
   * Is this address currently listed for sale? Returns the ACTIVE listing if
   * one exists, else null. Used for the ethics guard: never auto-email a
   * valuation to a seller under an exclusive listing with another brokerage.
   */
  async activeSaleListing(address: string): Promise<RentCastSaleListing | null> {
    const list = await this.get<RentCastSaleListing[]>('/listings/sale', { address })
    return list?.find((l) => (l.status ?? '').toLowerCase() === 'active') ?? null
  }

  /** Zip-level market stats for the report's market snapshot section. */
  async marketStats(zipCode: string): Promise<RentCastMarket | null> {
    return this.get<RentCastMarket>('/markets', {
      zipCode,
      dataType: 'Sale',
      historyRange: '6',
    })
  }
}
