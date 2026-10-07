import { describe, expect, it } from 'vitest'
import { filterTransactions, paginate } from './accountTransactions'

describe('filterTransactions', () => {
  const rows = [
    { id: 1, counterparty_name: 'Colruyt', description: 'Groceries Ghent', effective_category: 'GROCERIES' },
    { id: 2, counterparty_name: 'NMBS', description: '', effective_category: 'TRANSPORT' },
  ]
  it('matches name or description case-insensitively', () => {
    expect(filterTransactions(rows, { search: 'ghent', category: 'ALL' }).map((r) => r.id)).toEqual([1])
    expect(filterTransactions(rows, { search: 'nmbs', category: 'ALL' }).map((r) => r.id)).toEqual([2])
  })
  it('filters by category and combines with search', () => {
    expect(filterTransactions(rows, { search: '', category: 'TRANSPORT' }).map((r) => r.id)).toEqual([2])
    expect(filterTransactions(rows, { search: 'colruyt', category: 'TRANSPORT' })).toEqual([])
  })
  it('tolerates a null description', () => {
    expect(filterTransactions([{ id: 3, counterparty_name: 'X', description: null, effective_category: 'OTHER' }], { search: 'x', category: 'ALL' })).toHaveLength(1)
  })
})

describe('paginate', () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ id: i }))
  it('slices a page and counts pages', () => {
    expect(paginate(rows, 2)).toMatchObject({ page: 2, pageCount: 3, total: 60 })
    expect(paginate(rows, 2).rows[0].id).toBe(25)
  })
  it('clamps an out-of-range page', () => {
    expect(paginate(rows, 99).page).toBe(3)
    expect(paginate(rows, 0).page).toBe(1)
  })
  it('has one empty page for no rows', () => {
    expect(paginate([], 1)).toMatchObject({ rows: [], page: 1, pageCount: 1, total: 0 })
  })
})
