import { describe, expect, it } from 'vitest'

import {
  buildWeekGrid,
  currentWeekLabel,
  dayDate,
  eventKey,
  fmtRevenue,
  gridSessionKey,
  groupByWeekday,
  moveLabel,
  rankEvents,
  reportStatus,
  sessionWords,
  splitBySession,
  weekdayKeyOf,
  weekLabel,
  WEEKDAYS,
  yourWeekTally,
} from './earnings'

describe('currentWeekLabel', () => {
  it('is This week on a trading day', () => {
    expect(currentWeekLabel(new Date('2026-10-19T09:00:00'))).toBe('This week')
    expect(currentWeekLabel(new Date('2026-10-23T22:00:00'))).toBe('This week')
  })

  it('is Upcoming week on a Saturday or Sunday', () => {
    expect(currentWeekLabel(new Date('2026-10-24T09:00:00'))).toBe('Upcoming week')
    expect(currentWeekLabel(new Date('2026-10-25T09:00:00'))).toBe('Upcoming week')
  })
})

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

const e = (o = {}) => ({
  symbol: 'X', date: '2026-10-26', session: 'amc', held: false, watched: false, mine: false,
  weight_pct: null, market_cap: null, revenue_estimate: null, eps_actual: null, eps_surprise_pct: null,
  move_pct: null, move_basis: null, ...o,
})

describe('sessionWords', () => {
  it('says each session in words and admits an unset time', () => {
    expect(sessionWords('bmo')).toBe('Before open')
    expect(sessionWords('amc')).toBe('After close')
    expect(sessionWords('dmh')).toBe('During hours')
    expect(sessionWords(null)).toBe('Time not set')
  })
})

describe('rankEvents', () => {
  it('puts holdings by weight, then watchlist, then the market by cap', () => {
    const ranked = rankEvents([
      e({ symbol: 'BIG', market_cap: 9e6 }),
      e({ symbol: 'W', watched: true, mine: true, market_cap: 1 }),
      e({ symbol: 'H1', held: true, mine: true, weight_pct: 2 }),
      e({ symbol: 'H2', held: true, mine: true, weight_pct: 8 }),
    ])
    expect(ranked.map((r) => r.symbol)).toEqual(['H2', 'H1', 'W', 'BIG'])
  })

  it('ranks unknown caps last and falls back to revenue estimate', () => {
    const ranked = rankEvents([
      e({ symbol: 'NOCAP_SMALL', revenue_estimate: 1 }),
      e({ symbol: 'CAP', market_cap: 5 }),
      e({ symbol: 'NOCAP_BIG', revenue_estimate: 9 }),
    ])
    expect(ranked.map((r) => r.symbol)).toEqual(['CAP', 'NOCAP_BIG', 'NOCAP_SMALL'])
  })

  it('does not mutate its input', () => {
    const input = [e({ symbol: 'B', market_cap: 1 }), e({ symbol: 'A', market_cap: 2 })]
    rankEvents(input)
    expect(input[0].symbol).toBe('B')
  })
})

describe('buildWeekGrid', () => {
  it('lays a week out by session and weekday', () => {
    const grid = buildWeekGrid([
      e({ symbol: 'A', date: '2026-10-26', session: 'bmo' }),
      e({ symbol: 'B', date: '2026-10-28', session: 'amc' }),
    ])
    expect(grid.days.map(([k]) => k)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri'])
    expect(grid.sessions.map(([k]) => k)).toEqual(['bmo', 'amc'])
    expect(grid.cells.bmo.mon.map((r) => r.symbol)).toEqual(['A'])
    expect(grid.cells.amc.wed.map((r) => r.symbol)).toEqual(['B'])
    expect(grid.cells.amc.mon).toEqual([])
  })

  it('adds the during-hours row only when the week has one', () => {
    const grid = buildWeekGrid([e({ session: 'dmh' }), e({ symbol: 'Y', session: null })])
    expect(grid.sessions.map(([k]) => k)).toEqual(['bmo', 'amc', 'other'])
    expect(grid.cells.other.mon).toHaveLength(2)
  })

  it('adds a weekend column only when it carries a report', () => {
    const grid = buildWeekGrid([e({ date: '2026-10-31' })])
    expect(grid.days.map(([k]) => k)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
  })

  it('ranks each cell', () => {
    const grid = buildWeekGrid([e({ symbol: 'S', market_cap: 1 }), e({ symbol: 'L', market_cap: 9 })])
    expect(grid.cells.amc.mon.map((r) => r.symbol)).toEqual(['L', 'S'])
  })
})

describe('gridSessionKey', () => {
  it('folds during-hours and unset into one row', () => {
    expect(gridSessionKey('bmo')).toBe('bmo')
    expect(gridSessionKey('dmh')).toBe('other')
    expect(gridSessionKey(undefined)).toBe('other')
  })
})

describe('weekdayKeyOf', () => {
  it('names the weekday of an ISO date', () => {
    expect(weekdayKeyOf('2026-10-26')).toBe('mon')
    expect(weekdayKeyOf('2026-11-01')).toBe('sun')
  })
})

describe('moveLabel', () => {
  it('is the signed move and its window', () => {
    expect(moveLabel(e({ move_pct: 3.21, move_basis: '1d' }))).toEqual({ text: '+3.2%', basis: '1d' })
    expect(moveLabel(e({ move_pct: -4, move_basis: '2d' }))).toEqual({ text: '-4.0%', basis: '2d' })
  })

  it('is null without a move', () => {
    expect(moveLabel(e())).toBeNull()
  })
})

describe('yourWeekTally', () => {
  it('counts only my names, reported and beating', () => {
    expect(
      yourWeekTally([
        e({ mine: true, eps_actual: 1, eps_surprise_pct: 5 }),
        e({ mine: true, eps_actual: 1, eps_surprise_pct: -2 }),
        e({ mine: true }),
        e({ eps_actual: 1, eps_surprise_pct: 9 }),
      ]),
    ).toEqual({ count: 3, reported: 2, beat: 1 })
  })
})
