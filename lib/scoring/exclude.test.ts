import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isExcludedName } from './exclude.ts'

test('excludes exact team-member names', () => {
  assert.equal(isExcludedName('Erik Peterson'), true)
  assert.equal(isExcludedName('Courtney Law'), true)
  assert.equal(isExcludedName('Reizeal Ida Saligan'), true)
})

test('excludes despite case, spacing, punctuation, middle initial', () => {
  assert.equal(isExcludedName('  DAN   RUBY  '), true)
  assert.equal(isExcludedName('erik c. peterson'), true)
  assert.equal(isExcludedName('Cami Hinz, REALTOR'), true)
})

test('does not exclude real leads or empty input', () => {
  assert.equal(isExcludedName('Amanda Johnston'), false)
  assert.equal(isExcludedName('Patrick'), false)
  assert.equal(isExcludedName(''), false)
  assert.equal(isExcludedName(null), false)
})
