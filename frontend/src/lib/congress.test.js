import { describe, expect, it } from 'vitest'

import { activity, activityLabel, basisNote, directoryMembers, filedLine, fmtRange, partyLabel, tradeLabel } from './congress'

describe('partyLabel', () => {
  it('abbreviates the party and keeps the district', () => {
    expect(partyLabel('Democrat', 'CA11')).toBe('D-CA11')
    expect(partyLabel('Republican', 'TX02')).toBe('R-TX02')
  })
  it('falls back to the district alone when the party is unknown', () => {
    expect(partyLabel('', 'ZZ01')).toBe('ZZ01')
  })
})

describe('fmtRange', () => {
  it('formats a closed and an open range', () => {
    expect(fmtRange(15001, 50000)).toBe('$15,001–$50,000')
    expect(fmtRange(50000000, null)).toBe('Over $50,000,000')
  })
})

describe('tradeLabel', () => {
  it('names the kind and the option', () => {
    expect(tradeLabel({ kind: 'purchase', option: 'call', exercise: false })).toBe('Bought (call)')
    expect(tradeLabel({ kind: 'partial_sale', option: '', exercise: false })).toBe('Sold part')
    expect(tradeLabel({ kind: 'purchase', option: '', exercise: true })).toBe('Bought (exercise)')
  })
})

describe('basisNote', () => {
  it('lists only the caveats that apply', () => {
    expect(basisNote({ trades: 40, paper_reports: 2, failed_reports: 0, unparsed_rows: 0, unseen_sales: 3, unpriced: 0, since: '2021-01-01' }))
      .toBe('Estimated from 40 disclosed trades since 2021 at the midpoint of each reported range · 2 paper reports not included · 3 sales of holdings not seen bought ignored')
  })
  it('says from when prices reach back', () => {
    expect(basisNote({ trades: 40, since: '2021-01-01', priced_from: '2021-12-07' }))
      .toBe('Estimated from 40 disclosed trades since 2021, priced from Dec 2021 at the midpoint of each reported range')
  })
  it('says nothing is known yet for an empty basis', () => {
    expect(basisNote({})).toBe('No parsed trades yet.')
  })
})

describe('activity', () => {
  it('is null for an unknown ticker and for a stock nobody trades or holds', () => {
    expect(activity(null)).toBeNull()
    expect(activity({ holders: 0, buyers: 0, sellers: 0 })).toBeNull()
  })
  it('reports holders when nobody traded it recently', () => {
    expect(activity({ holders: 2, buyers: 0, sellers: 0 })).toEqual({ holders: 2 })
    expect(activityLabel({ holders: 1, buyers: 0, sellers: 0 }, 90)).toBe('1 member of Congress holds it (estimated); none traded it in reports filed in the last 90 days')
    expect(activityLabel({ holders: 3, buyers: 0, sellers: 0 }, 90)).toBe('3 members of Congress hold it (estimated); none traded it in reports filed in the last 90 days')
  })
  it('reports buyers and sellers', () => {
    expect(activity({ holders: 1, buyers: 3, sellers: 1 })).toEqual({ buyers: 3, sellers: 1 })
    expect(activityLabel({ holders: 1, buyers: 3, sellers: 1 }, 90)).toBe('3 members of Congress bought and 1 sold in reports filed in the last 90 days · 1 holds it (estimated)')
  })
})

const TODAY = new Date('2026-10-18T12:00:00Z')
const member = (slug, overrides = {}) => ({
  slug, name: slug, party: 'Democrat', state_district: 'CA11', trades: 1, last_filed: '2026-10-01', excess_cagr_pct: null, ...overrides,
})
const MEMBERS = [
  member('Nancy Pelosi', { trades: 40, excess_cagr_pct: 12.3 }),
  member('Dan Crenshaw', { party: 'Republican', state_district: 'TX02', trades: 12, last_filed: '2026-05-01' }),
  member('Ro Khanna', { state_district: 'CA17', trades: 5, last_filed: '2026-09-20', excess_cagr_pct: 20.1 }),
  member('Tom Suozzi', { state_district: 'NY03', trades: 3, last_filed: '2024-01-10', excess_cagr_pct: -4.2 }),
]
const names = (rows) => rows.map((row) => row.name)

describe('directoryMembers', () => {
  it('orders by copy edge by default, members without one last', () => {
    expect(names(directoryMembers(MEMBERS, { today: TODAY }))).toEqual(['Ro Khanna', 'Nancy Pelosi', 'Tom Suozzi', 'Dan Crenshaw'])
  })

  it('sorts by trades, latest filing and name', () => {
    expect(names(directoryMembers(MEMBERS, { sort: 'trades', today: TODAY }))).toEqual(['Nancy Pelosi', 'Dan Crenshaw', 'Ro Khanna', 'Tom Suozzi'])
    expect(names(directoryMembers(MEMBERS, { sort: 'filed', today: TODAY }))).toEqual(['Nancy Pelosi', 'Ro Khanna', 'Dan Crenshaw', 'Tom Suozzi'])
    expect(names(directoryMembers(MEMBERS, { sort: 'name', today: TODAY }))).toEqual(['Dan Crenshaw', 'Nancy Pelosi', 'Ro Khanna', 'Tom Suozzi'])
  })

  it('searches names case-insensitively', () => {
    expect(names(directoryMembers(MEMBERS, { query: 'khan', today: TODAY }))).toEqual(['Ro Khanna'])
  })

  it('searches a state or a district', () => {
    expect(names(directoryMembers(MEMBERS, { query: 'ca', sort: 'name', today: TODAY }))).toEqual(['Nancy Pelosi', 'Ro Khanna'])
    expect(names(directoryMembers(MEMBERS, { query: 'TX02', today: TODAY }))).toEqual(['Dan Crenshaw'])
  })

  it('adds members who traded or hold a searched ticker', () => {
    const traders = new Set(['Tom Suozzi'])
    expect(names(directoryMembers(MEMBERS, { query: 'NVDA', traderSlugs: traders, today: TODAY }))).toEqual(['Tom Suozzi'])
  })

  it('filters by party, recent activity and beating the market', () => {
    expect(names(directoryMembers(MEMBERS, { chip: 'republican', today: TODAY }))).toEqual(['Dan Crenshaw'])
    expect(names(directoryMembers(MEMBERS, { chip: 'democrat', sort: 'name', today: TODAY }))).toEqual(['Nancy Pelosi', 'Ro Khanna', 'Tom Suozzi'])
    expect(names(directoryMembers(MEMBERS, { chip: 'active', sort: 'name', today: TODAY }))).toEqual(['Nancy Pelosi', 'Ro Khanna'])
    expect(names(directoryMembers(MEMBERS, { chip: 'beating', today: TODAY }))).toEqual(['Ro Khanna', 'Nancy Pelosi'])
  })
})

describe('filedLine', () => {
  it('says when the member last filed', () => {
    expect(filedLine('2026-10-01')).toBe('Last filed 01 Oct 2026')
  })
  it('handles a member with no filing', () => {
    expect(filedLine(null)).toBe('No filings imported')
  })
})
