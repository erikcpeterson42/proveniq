import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qualify, formatAddress, hasUsableAddress } from './qualify.ts'
import type { ValuationLead } from './types.ts'

function lead(overrides: Partial<ValuationLead>): ValuationLead {
  return {
    id: 1,
    name: 'Test Lead',
    lead_type: null,
    tags: [],
    address_street: null,
    city: null,
    address_state: null,
    address_zip: null,
    ...overrides,
  }
}

test('address + seller signal -> auto_send', () => {
  const r = qualify(lead({
    lead_type: 'seller',
    address_street: '12 Main St',
    city: 'Williston',
    address_state: 'ND',
    address_zip: '58801',
  }))
  assert.equal(r.disposition, 'auto_send')
  assert.equal(r.address, '12 Main St, Williston, ND 58801')
})

test('address without seller signal -> hold_review', () => {
  const r = qualify(lead({
    lead_type: 'buyer',
    address_street: '404 Elm Ave',
    city: 'Watford City',
    address_state: 'ND',
  }))
  assert.equal(r.disposition, 'hold_review')
  assert.equal(r.address, '404 Elm Ave, Watford City, ND')
})

test('seller signal without address -> needs_address', () => {
  const r = qualify(lead({ lead_type: 'seller' }))
  assert.equal(r.disposition, 'needs_address')
  assert.equal(r.address, null)
})

test('no address, no seller signal -> skip', () => {
  const r = qualify(lead({ lead_type: 'buyer' }))
  assert.equal(r.disposition, 'skip')
})

test('junk street lines are not usable addresses', () => {
  assert.equal(hasUsableAddress(lead({ address_street: 'N/A', city: 'Williston' })), false)
  assert.equal(hasUsableAddress(lead({ address_street: 'Main St', city: 'Williston' })), false) // no house number
  assert.equal(hasUsableAddress(lead({ address_street: 'PO Box 218', city: 'Williston' })), false)
  assert.equal(hasUsableAddress(lead({ address_street: '12 Main St', city: null })), false) // no city
})

test('a seller with a junk address is treated as needs_address, not auto_send', () => {
  const r = qualify(lead({ lead_type: 'seller', address_street: 'PO Box 218', city: 'Williston' }))
  assert.equal(r.disposition, 'needs_address')
})

test('formatAddress skips missing state/zip cleanly', () => {
  assert.equal(
    formatAddress(lead({ address_street: '12 Main St', city: 'Williston' })),
    '12 Main St, Williston',
  )
})
