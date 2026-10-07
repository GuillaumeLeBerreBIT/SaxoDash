import { describe, expect, it } from 'vitest'
import { accountsOf, filterByDateRange, rangeForPreset, readFilters, writeFilters } from './transactionFilters'

const rows = [
  { id: 1, date: '2026-01-01', account: 'Saxo' },
  { id: 2, date: '2026-03-15', account: 'Bank' },
  { id: 3, date: '2026-06-30', account: 'Saxo' },
]
const ids = (list) => list.map((r) => r.id)

describe('filterByDateRange', () => {
  it('includes both bounds', () => {
    expect(ids(filterByDateRange(rows, { from: '2026-01-01', to: '2026-03-15' }))).toEqual([1, 2])
  })

  it('applies one bound alone', () => {
    expect(ids(filterByDateRange(rows, { from: '2026-03-15', to: '' }))).toEqual([2, 3])
    expect(ids(filterByDateRange(rows, { from: '', to: '2026-03-15' }))).toEqual([1, 2])
  })

  it('ignores an empty or invalid bound', () => {
    expect(filterByDateRange(rows, { from: '', to: '' })).toHaveLength(3)
    expect(filterByDateRange(rows, { from: 'garbage', to: '2026-13-45' })).toHaveLength(3)
    expect(filterByDateRange(rows, {})).toHaveLength(3)
  })

  it('returns nothing when from is after to', () => {
    expect(filterByDateRange(rows, { from: '2026-06-01', to: '2026-02-01' })).toEqual([])
  })
})

describe('accountsOf', () => {
  it('returns sorted unique non-empty names', () => {
    expect(accountsOf([...rows, { account: '' }, { account: null }, { account: 'Alpha' }])).toEqual(['Alpha', 'Bank', 'Saxo'])
  })
})

describe('rangeForPreset', () => {
  it('30D is thirty days ending today, inclusive', () => {
    expect(rangeForPreset('30D', '2026-10-07')).toEqual({ from: '2026-09-08', to: '2026-10-07' })
  })

  it('YTD starts on January 1 of the year', () => {
    expect(rangeForPreset('YTD', '2026-10-07')).toEqual({ from: '2026-01-01', to: '2026-10-07' })
  })

  it('1Y starts the same day one year earlier', () => {
    expect(rangeForPreset('1Y', '2026-10-07')).toEqual({ from: '2025-10-07', to: '2026-10-07' })
  })

  it('1Y from a leap day lands on the last day of February', () => {
    expect(rangeForPreset('1Y', '2028-02-29')).toEqual({ from: '2027-02-28', to: '2028-02-29' })
  })

  it('crosses a month boundary for 30D', () => {
    expect(rangeForPreset('30D', '2026-01-10')).toEqual({ from: '2025-12-12', to: '2026-01-10' })
  })
})

describe('readFilters / writeFilters', () => {
  it('defaults when the URL is empty', () => {
    expect(readFilters(new URLSearchParams())).toEqual({ search: '', type: 'All', account: '', from: '', to: '' })
  })

  it('round-trips every field', () => {
    const filters = { search: 'nvd', type: 'BUY', account: 'Saxo Main', from: '2026-01-01', to: '2026-02-01' }
    expect(readFilters(writeFilters(filters))).toEqual(filters)
  })

  it('omits defaults when writing', () => {
    expect(writeFilters({ search: '', type: 'All', account: '', from: '', to: '' }).toString()).toBe('')
    expect(writeFilters({ search: '', type: 'BUY', account: '', from: '', to: '' }).toString()).toBe('type=BUY')
  })

  it('drops invalid dates', () => {
    const read = readFilters(new URLSearchParams('from=nope&to=2026-02-31'))
    expect(read.from).toBe('')
    expect(read.to).toBe('')
  })

  it('falls back on garbage', () => {
    expect(readFilters(new URLSearchParams('type=&account=&q=&from=%00'))).toEqual({
      search: '', type: 'All', account: '', from: '', to: '',
    })
  })
})
