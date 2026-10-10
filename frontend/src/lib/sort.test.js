import { describe, expect, it } from 'vitest'

import { nextSort, sortRows } from './sort'

const by = (key) => ({ [key]: (row) => row[key] })

describe('sortRows', () => {
  it('sorts numbers ascending and descending', () => {
    const rows = [{ v: 3 }, { v: 1 }, { v: 2 }]
    expect(sortRows(rows, { key: 'v', direction: 'asc' }, by('v')).map((r) => r.v)).toEqual([1, 2, 3])
    expect(sortRows(rows, { key: 'v', direction: 'desc' }, by('v')).map((r) => r.v)).toEqual([3, 2, 1])
  })

  it('sorts numeric strings numerically', () => {
    const rows = [{ v: '999.5' }, { v: '1000.00' }, { v: '25' }]
    expect(sortRows(rows, { key: 'v', direction: 'asc' }, by('v')).map((r) => r.v)).toEqual([
      '25',
      '999.5',
      '1000.00',
    ])
  })

  it('sorts strings case-insensitively', () => {
    const rows = [{ v: 'banana' }, { v: 'Apple' }, { v: 'cherry' }]
    expect(sortRows(rows, { key: 'v', direction: 'asc' }, by('v')).map((r) => r.v)).toEqual([
      'Apple',
      'banana',
      'cherry',
    ])
  })

  it('sorts ISO dates chronologically', () => {
    const rows = [{ v: '2026-03-01' }, { v: '2025-12-31' }, { v: '2026-01-15T10:00:00Z' }]
    expect(sortRows(rows, { key: 'v', direction: 'asc' }, by('v')).map((r) => r.v)).toEqual([
      '2025-12-31',
      '2026-01-15T10:00:00Z',
      '2026-03-01',
    ])
  })

  it('keeps equal keys in input order in both directions', () => {
    const rows = [
      { id: 'a', v: 1 },
      { id: 'b', v: 1 },
      { id: 'c', v: 1 },
    ]
    expect(sortRows(rows, { key: 'v', direction: 'asc' }, by('v')).map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(sortRows(rows, { key: 'v', direction: 'desc' }, by('v')).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('puts missing values last in both directions', () => {
    const rows = [{ v: null }, { v: 2 }, { v: undefined }, { v: 1 }, { v: NaN }, { v: '' }]
    const asc = sortRows(rows, { key: 'v', direction: 'asc' }, by('v')).map((r) => r.v)
    const desc = sortRows(rows, { key: 'v', direction: 'desc' }, by('v')).map((r) => r.v)
    expect(asc.slice(0, 2)).toEqual([1, 2])
    expect(desc.slice(0, 2)).toEqual([2, 1])
    expect(asc).toHaveLength(6)
    expect(desc).toHaveLength(6)
  })

  it('does not mutate the input', () => {
    const rows = [{ v: 2 }, { v: 1 }]
    const out = sortRows(rows, { key: 'v', direction: 'asc' }, by('v'))
    expect(out).not.toBe(rows)
    expect(rows.map((r) => r.v)).toEqual([2, 1])
  })

  it('returns a copy unchanged when there is no sort or no accessor', () => {
    const rows = [{ v: 2 }, { v: 1 }]
    expect(sortRows(rows, null, by('v'))).toEqual(rows)
    expect(sortRows(rows, null, by('v'))).not.toBe(rows)
    expect(sortRows(rows, { key: 'x', direction: 'asc' }, by('v'))).toEqual(rows)
  })
})

describe('nextSort', () => {
  it('cycles asc, desc, none on the same key', () => {
    const a = nextSort(null, 'v')
    expect(a).toEqual({ key: 'v', direction: 'asc' })
    const d = nextSort(a, 'v')
    expect(d).toEqual({ key: 'v', direction: 'desc' })
    expect(nextSort(d, 'v')).toBeNull()
  })

  it('starts at asc for a new key', () => {
    expect(nextSort({ key: 'v', direction: 'desc' }, 'w')).toEqual({ key: 'w', direction: 'asc' })
  })
})
