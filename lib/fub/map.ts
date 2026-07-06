// Pure mapping functions: Follow Up Boss shapes -> our DB rows.
// No I/O here so these stay easy to reason about and test.

import type {
  FubPerson,
  FubEvent,
  FubCall,
  FubTextMessage,
  FubNote,
  FubEmailEvent,
  LeadEventRow,
  LeadEventType,
} from './types'

// Tag/stage keywords that hint whether a lead is a seller or a buyer.
// Sellers are Proven Realty's primary focus, so ambiguous ties -> seller.
const SELLER_HINTS = [
  'seller', 'listing', 'cash_offer', 'cash offer', 'home value',
  'valuation', 'net proceeds', 'sell',
]
const BUYER_HINTS = [
  'buyer', 'showing', 'pre-approved', 'preapproved', 'looking to buy',
]

export function deriveLeadType(
  tags: string[],
  stage?: string | null,
): 'buyer' | 'seller' | null {
  const hay = [...tags, stage ?? ''].join(' ').toLowerCase()
  const seller = SELLER_HINTS.some((h) => hay.includes(h))
  const buyer = BUYER_HINTS.some((h) => hay.includes(h))
  if (seller && !buyer) return 'seller'
  if (buyer && !seller) return 'buyer'
  if (seller && buyer) return 'seller' // tie -> sellers are primary focus
  return null
}

function primary<T extends { value?: string; isPrimary?: number | boolean }>(
  list?: T[],
): string | null {
  if (!list?.length) return null
  const p = list.find((x) => x.isPrimary === true || x.isPrimary === 1)
  return (p ?? list[0]).value ?? null
}

function stageName(stage?: string | { name?: string }): string | null {
  if (!stage) return null
  return typeof stage === 'string' ? stage : stage.name ?? null
}

// Maps a FUB person -> a row for our `leads` table. Note we deliberately
// do NOT set last_touch_at / last_inbound_at here — those are derived from
// events by recompute_lead_touch() so an upsert never clobbers them.
export function mapPerson(p: FubPerson, now: string): Record<string, unknown> {
  const tags = Array.isArray(p.tags) ? p.tags : []
  const stage = stageName(p.stage)
  return {
    id: p.id,
    name: p.name ?? null,
    first_name: p.firstName ?? null,
    email: primary(p.emails),
    phone: primary(p.phones),
    lead_type: deriveLeadType(tags, stage),
    stage,
    source: p.source ?? null,
    assigned_agent: p.assignedTo ?? null,
    tags,
    fub_created_at: p.created ?? null,
    last_activity_at: p.lastActivity ?? null,
    price_range: p.price != null ? String(p.price) : null,
    city: p.addresses?.[0]?.city ?? null,
    raw: p as unknown as Record<string, unknown>,
    synced_at: now,
  }
}

// FUB event.type -> our lead_events.type. Types not in this map (calls,
// texts, unsubscribes, etc.) are handled by dedicated endpoints or skipped.
const EVENT_TYPE_MAP: Record<string, LeadEventType> = {
  'Viewed Property': 'property_view',
  'Saved Property': 'saved_property',
  Inquiry: 'inquiry',
  'Property Inquiry': 'inquiry',
  'Seller Inquiry': 'inquiry',
  'General Inquiry': 'inquiry',
  'Visited Website': 'website_visit',
  'Viewed Page': 'website_visit',
  'Property Search': 'website_visit',
  'Saved Property Search': 'website_visit',
  'Visited Open House': 'website_visit',
}

export function mapEvent(e: FubEvent): LeadEventRow | null {
  if (!e.personId || !e.created || !e.type) return null
  const type = EVENT_TYPE_MAP[e.type]
  if (!type) return null
  return {
    lead_id: e.personId,
    type,
    occurred_at: e.created,
    payload: {
      fub_type: e.type,
      message: e.message ?? null,
      property: e.property ?? null,
      source: e.source ?? null,
    },
    fub_id: e.id,
    source_kind: 'event',
  }
}

function isInbound(flag?: boolean | number, direction?: string): boolean {
  return flag === true || flag === 1 || (direction ?? '').toLowerCase() === 'inbound'
}

export function mapCall(c: FubCall): LeadEventRow | null {
  if (!c.personId || !c.created) return null
  return {
    lead_id: c.personId,
    type: 'call',
    occurred_at: c.created,
    payload: {
      direction: isInbound(c.isIncoming, c.direction) ? 'inbound' : 'outbound',
      duration: c.duration ?? null,
      outcome: c.outcome ?? null,
      note: c.note ?? null,
    },
    fub_id: c.id,
    source_kind: 'call',
  }
}

export function mapText(m: FubTextMessage): LeadEventRow | null {
  if (!m.personId || !m.created) return null
  const inbound = isInbound(m.isIncoming, m.direction)
  return {
    lead_id: m.personId,
    type: inbound ? 'text_in' : 'text_out',
    occurred_at: m.created,
    payload: { body: m.message ?? m.body ?? null },
    fub_id: m.id,
    source_kind: 'text',
  }
}

export function mapNote(n: FubNote): LeadEventRow | null {
  if (!n.personId || !n.created) return null
  return {
    lead_id: n.personId,
    type: 'note',
    occurred_at: n.created,
    payload: { subject: n.subject ?? null, body: n.body ?? null },
    fub_id: n.id,
    source_kind: 'note',
  }
}

export function mapEmailEvent(e: FubEmailEvent): LeadEventRow | null {
  if (!e.personId || !e.created || !e.type) return null
  const t = e.type.toLowerCase()
  const type: LeadEventType | null = t.includes('click')
    ? 'email_click'
    : t.includes('open')
      ? 'email_open'
      : null
  if (!type) return null
  return {
    lead_id: e.personId,
    type,
    occurred_at: e.created,
    payload: { fub_type: e.type },
    fub_id: e.id,
    source_kind: 'email',
  }
}
