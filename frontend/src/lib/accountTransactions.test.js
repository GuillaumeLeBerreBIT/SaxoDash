import { describe, expect, it } from 'vitest'
import { filterByPeriod, filterSpending, filterTransactions, netSpend, paginate, spendTotal, spendingCategories } from './accountTransactions'

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

describe('filterByPeriod', () => {
  const rows = [
    { id: 1, booking_date: '2026-09-01' },
    { id: 2, booking_date: '2026-09-15' },
    { id: 3, booking_date: '2026-09-30' },
    { id: 4, booking_date: '2026-10-01' },
  ]
  it('includes both boundary days', () => {
    expect(filterByPeriod(rows, { from: '2026-09-01', to: '2026-09-30' }).map((r) => r.id)).toEqual([1, 2, 3])
  })
  it('ignores a bound that is not an ISO day', () => {
    expect(filterByPeriod(rows, { from: 'nope', to: undefined })).toHaveLength(4)
  })
  it('ignores an impossible calendar date like any other bad bound', () => {
    expect(filterByPeriod(rows, { from: '2026-13-45', to: '2026-02-30' })).toHaveLength(4)
  })
  it('is empty when from is after to', () => {
    expect(filterByPeriod(rows, { from: '2026-09-30', to: '2026-09-01' })).toEqual([])
  })
})

describe('filterSpending', () => {
  const tx = (id, booking_date, effective_category, amount) => ({ id, booking_date, effective_category, amount })
  const rows = [
    tx(1, '2026-09-02', 'GROCERIES', '-40.00'),
    tx(2, '2026-09-10', 'GROCERIES', '-10.50'),
    tx(3, '2026-09-12', 'GROCERIES', '5.50'),
    tx(4, '2026-09-12', 'DINING', '-20.00'),
    tx(5, '2026-09-13', 'TRANSFER', '-300.00'),
    tx(6, '2026-09-13', 'SAVINGS', '-100.00'),
    tx(7, '2026-08-31', 'GROCERIES', '-99.00'),
    tx(8, '2026-10-01', 'GROCERIES', '-77.00'),
    tx(9, '2026-09-30', 'GROCERIES', '-1.00'),
  ]
  const period = { from: '2026-09-01', to: '2026-09-30', today: '2026-12-01' }

  it('keeps credits so they net against the category, like the summary does', () => {
    expect(filterSpending(rows, { ...period, category: 'GROCERIES' }).map((r) => r.id)).toEqual([1, 2, 3, 9])
  })
  it('excludes transfers and savings even without a category', () => {
    expect(filterSpending(rows, period).map((r) => r.id)).toEqual([1, 2, 3, 4, 9])
  })
  it('does not return a transfer category even when asked for it', () => {
    expect(filterSpending(rows, { ...period, category: 'TRANSFER' })).toEqual([])
  })
  it('includes both boundary days and nothing outside', () => {
    const ids = filterSpending(rows, period).map((r) => r.id)
    expect(ids).not.toContain(7)
    expect(ids).not.toContain(8)
    expect(ids).toContain(9)
  })
  it('clamps the end of the period to today', () => {
    expect(filterSpending(rows, { ...period, today: '2026-09-10', category: 'GROCERIES' }).map((r) => r.id)).toEqual([1, 2])
  })
  it('treats ALL as no category filter', () => {
    expect(filterSpending(rows, { ...period, category: 'ALL' })).toHaveLength(5)
  })
  it('totals a category to the same amount the summary reports (net outflow)', () => {
    const mine = filterSpending(rows, { ...period, category: 'GROCERIES' })
    expect(netSpend(mine)).toBe(46)
  })
})

describe('spendTotal', () => {
  const tx = (effective_category, amount) => ({ effective_category, amount })
  it('sums only categories whose net is an outflow, like the summary', () => {
    const rows = [
      tx('GROCERIES', '-40.00'),
      tx('GROCERIES', '10.00'),
      tx('DINING', '-20.00'),
      tx('INCOME', '2000.00'),
      tx('REFUND_CREDIT', '5.00'),
    ]
    expect(spendTotal(rows)).toBe(50)
  })
  it('ignores transfers and savings', () => {
    expect(spendTotal([tx('TRANSFER', '-300.00'), tx('SAVINGS', '-50.00'), tx('DINING', '-5.00')])).toBe(5)
  })
  it('is zero with nothing to count', () => {
    expect(spendTotal([])).toBe(0)
  })
})

describe('spendingCategories', () => {
  const tx = (effective_category, amount) => ({ effective_category, amount })
  it('keeps categories with a net outflow and drops income', () => {
    expect(spendingCategories([tx('GROCERIES', '-40.00'), tx('INCOME', '2500.00'), tx('DINING', '-5.00')]).sort()).toEqual(['DINING', 'GROCERIES'])
  })
  it('keeps a category with refunds only while its net stays negative', () => {
    expect(spendingCategories([tx('GROCERIES', '-40.00'), tx('GROCERIES', '10.00')])).toEqual(['GROCERIES'])
    expect(spendingCategories([tx('GROCERIES', '-40.00'), tx('GROCERIES', '40.00')])).toEqual([])
    expect(spendingCategories([tx('GROCERIES', '-40.00'), tx('GROCERIES', '50.00')])).toEqual([])
  })
  it('leaves out transfers and savings', () => {
    expect(spendingCategories([tx('TRANSFER', '-300.00'), tx('SAVINGS', '-50.00')])).toEqual([])
  })
})
