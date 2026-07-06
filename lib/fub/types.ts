// TypeScript shapes for the Follow Up Boss API responses we consume,
// plus the row shape we write into our own lead_events table.
// Field names verified against docs.followupboss.com.

export interface FubMetadata {
  collection?: string
  offset?: number
  limit?: number
  total?: number
  next?: string | null
  nextLink?: string | null
}

export interface FubEmail {
  value?: string
  type?: string
  isPrimary?: number | boolean
}

export interface FubPhone {
  value?: string
  type?: string
  isPrimary?: number | boolean
}

export interface FubAddress {
  city?: string
  state?: string
  code?: string
  type?: string
}

export interface FubPerson {
  id: number
  name?: string
  firstName?: string
  lastName?: string
  emails?: FubEmail[]
  phones?: FubPhone[]
  tags?: string[]
  stage?: string | { name?: string }
  source?: string
  assignedTo?: string
  assignedUserId?: number
  created?: string
  updated?: string
  lastActivity?: string
  addresses?: FubAddress[]
  price?: number
  [key: string]: unknown
}

export interface FubEvent {
  id: number
  personId?: number
  type?: string
  message?: string
  source?: string
  property?: Record<string, unknown>
  created?: string
}

export interface FubCall {
  id: number
  personId?: number
  userId?: number
  isIncoming?: boolean | number
  direction?: string
  duration?: number
  outcome?: string
  note?: string
  created?: string
}

export interface FubTextMessage {
  id: number
  personId?: number
  userId?: number
  isIncoming?: boolean | number
  direction?: string
  message?: string
  body?: string
  created?: string
}

export interface FubNote {
  id: number
  personId?: number
  subject?: string
  body?: string
  created?: string
}

export interface FubEmailEvent {
  id: number
  personId?: number
  type?: string
  created?: string
}

// The 10 event types allowed by our lead_events.type CHECK constraint.
export type LeadEventType =
  | 'property_view'
  | 'inquiry'
  | 'saved_property'
  | 'email_open'
  | 'email_click'
  | 'text_in'
  | 'text_out'
  | 'call'
  | 'note'
  | 'website_visit'

export interface LeadEventRow {
  lead_id: number
  type: LeadEventType
  occurred_at: string
  payload: Record<string, unknown>
  fub_id: number
  source_kind: string
}
