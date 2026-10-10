import { describe, expect, it } from 'vitest'

import { dayDate, eventKey, fmtRevenue, groupByWeekday, reportStatus, splitBySession, weekLabel, WEEKDAYS } from './earnings'

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

describe('reportStatus', () => {
  const TODAY = new Date('2026-09-16T00:00:00')

  it('is reported once an actual is in, regardless of date', () => {
    expect(reportStatus({ date: '2026-09-20', eps_actual: 1.2 }, TODAY)).toBe('reported')
  })

  it('is pending when the report date has passed with no actual yet', () => {
    expect(reportStatus({ date: '2026-09-10', eps_actual: null }, TODAY)).toBe('pending')
  })

  it('is upcoming when the report date has not happened yet', () => {
    expect(reportStatus({ date: '2026-09-16', eps_actual: null }, TODAY)).toBe('upcoming')
    expect(reportStatus({ date: '2026-09-20', eps_actual: null }, TODAY)).toBe('upcoming')
  })
})

describe('weekLabel', () => {
  it('collapses a shared month', () => {
    expect(weekLabel({ from: '2026-10-26', to: '2026-10-30' })).toBe('26 – 30 Oct 2026')
  })

  it('keeps both months across a boundary', () => {
    expect(weekLabel({ from: '2026-10-28', to: '2026-11-03' })).toBe('28 Oct – 3 Nov 2026')
  })

  it('names both months when a week spans the boundary', () => {
    expect(weekLabel({ from: '2026-09-28', to: '2026-10-02' })).toBe('28 Sep – 2 Oct 2026')
  })

  it('names both years when a week spans new year', () => {
    expect(weekLabel({ from: '2026-12-29', to: '2027-01-02' })).toBe('29 Dec 2026 – 2 Jan 2027')
  })

  it('is empty without a window', () => {
    expect(weekLabel(null)).toBe('')
  })
})

describe('fmtRevenue', () => {
  it.each([
    [null, '—'],
    [0, '0M'],
    [4.2e5, '<1M'],
    [4.2e6, '4.2M'],
    [3.2e7, '32M'],
    [1.5e9, '1.50B'],
    [2.5e12, '2.50T'],
  ])('%s -> %s', (input, expected) => {
    expect(fmtRevenue(input)).toBe(expected)
  })
})

describe('splitBySession', () => {
  const e = (symbol, session) => ({ symbol, session })

  it('files a missing session apart from before-open and after-close', () => {
    const sections = splitBySession([e('A', 'bmo'), e('B', 'amc'), e('C', null), e('D', undefined)])
    expect(sections.map((s) => [s.key, s.rows.map((r) => r.symbol)])).toEqual([
      ['bmo', ['A']],
      ['amc', ['B']],
      ['unset', ['C', 'D']],
    ])
  })

  it('keeps during-hours as its own section and omits empty ones', () => {
    const sections = splitBySession([e('A', 'dmh')])
    expect(sections.map((s) => s.label)).toEqual(['During hours'])
  })

  it('returns nothing for no events', () => {
    expect(splitBySession([])).toEqual([])
  })
})

describe('eventKey', () => {
  it('separates quarters of the same symbol and date', () => {
    const base = { symbol: 'X', date: '2026-10-26' }
    expect(eventKey({ ...base, year: 2026, quarter: 3 })).not.toBe(eventKey({ ...base, year: 2026, quarter: 4 }))
  })

  it('tolerates a missing quarter and year', () => {
    expect(eventKey({ symbol: 'X', date: '2026-10-26' })).toBe('X-2026-10-26--')
  })
})

describe('dayDate', () => {
  it('counts from the window Monday', () => {
    expect(dayDate('2026-10-26', 'mon')).toBe(26)
    expect(dayDate('2026-10-26', 'fri')).toBe(30)
  })

  it('rolls over a month boundary', () => {
    expect(dayDate('2026-10-26', 'sun')).toBe(1)
  })

  it('answers null without a window or for an unknown key', () => {
    expect(dayDate(undefined, 'mon')).toBeNull()
    expect(dayDate('2026-10-26', 'xyz')).toBeNull()
  })
})
