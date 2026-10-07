import { describe, expect, it } from 'vitest'
import { spendingDelta } from './spendingDelta'

describe('spendingDelta', () => {
  it('has no delta without a baseline', () => {
    expect(spendingDelta({ total: 100, previousTotal: null })).toMatchObject({ pct: null, badge: undefined, note: undefined })
    expect(spendingDelta({ total: 100, previousTotal: 0 }).pct).toBeNull()
  })
  it('names what it is compared with', () => {
    const d = spendingDelta({ total: 150, previousTotal: 100, comparisonLabel: 'same days last month' })
    expect(d).toMatchObject({ direction: 'up', tone: 'red', badge: '▲ 50.00%' })
    expect(d.note).toBe('vs €100.00 same days last month')
  })
  it('is green when spending fell', () => {
    expect(spendingDelta({ total: 50, previousTotal: 100 })).toMatchObject({ direction: 'down', tone: 'emerald', badge: '▼ 50.00%' })
  })
  it('is not red or green for no change', () => {
    expect(spendingDelta({ total: 100, previousTotal: 100 })).toMatchObject({ direction: 'flat', tone: 'zinc', badge: '0.00%' })
  })
})
