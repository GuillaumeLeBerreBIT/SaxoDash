import { describe, expect, it } from 'vitest'

import { groupByWeekday, weekLabel, WEEKDAYS } from './earnings'

describe('groupByWeekday', () => {
  it('buckets events by weekday and keeps input order', () => {
    // 2026-10-26 is a Monday.
    const groups = groupByWeekday([
      { symbol: 'A', date: '2026-10-26' },
      { symbol: 'B', date: '2026-10-27' },
      { symbol: 'C', date: '2026-10-27' },
      { symbol: 'D', date: '2026-10-30' },
    ])
    expect(groups.mon.map((e) => e.symbol)).toEqual(['A'])
    expect(groups.tue.map((e) => e.symbol)).toEqual(['B', 'C'])
    expect(groups.fri.map((e) => e.symbol)).toEqual(['D'])
  })

  it('omits weekend keys when they carry nothing', () => {
    expect(groupByWeekday([{ symbol: 'A', date: '2026-10-26' }]).sat).toBeUndefined()
  })

  it('WEEKDAYS lists Monday first', () => {
    expect(WEEKDAYS[0]).toEqual(['mon', 'Mon'])
  })
})

describe('weekLabel', () => {
  it('collapses a shared month', () => {
    expect(weekLabel({ from: '2026-10-26', to: '2026-10-30' })).toBe('Oct 26 – 30 · October 2026')
  })

  it('keeps both months across a boundary', () => {
    expect(weekLabel({ from: '2026-10-28', to: '2026-11-03' })).toBe('Oct 28 – Nov 3 · November 2026')
  })

  it('is empty without a window', () => {
    expect(weekLabel(null)).toBe('')
  })
})
