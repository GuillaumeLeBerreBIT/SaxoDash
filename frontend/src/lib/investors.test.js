import { beforeEach, describe, expect, it } from 'vitest'

import { OTHER_SLICE, colorForRank } from './charts'
import {
  donutSlices, filterHoldings, fmtFiledDate, fmtUsdCompact, latestQuarter, looksLikeTicker,
  quarterLabel, readTop10View, remainder, topTen, visibleInvestors, writeTop10View,
} from './investors'

const card = (over) => ({
  slug: 's', name: 'N', firm: 'F', curated: true, stale: false, total_value: 1, positions: 1,
  new_count: 0, exited_count: 0, latest_quarter: '2026-06-30', ...over,
})

describe('labels and formatting', () => {
  it('names a quarter end', () => {
    expect(quarterLabel('2026-06-30')).toBe('Q2 2026')
    expect(quarterLabel('2025-12-31')).toBe('Q4 2025')
    expect(quarterLabel(null)).toBe('—')
  })

  it('compacts dollar values', () => {
    expect(fmtUsdCompact(299253556246)).toBe('$299.3B')
    expect(fmtUsdCompact(1_250_000_000_000)).toBe('$1.25T')
    expect(fmtUsdCompact(920_400_000)).toBe('$920M')
    expect(fmtUsdCompact(450_400)).toBe('$450K')
    expect(fmtUsdCompact(12)).toBe('$12')
    expect(fmtUsdCompact(null)).toBe('—')
  })

  it('signs a dollar change on request', () => {
    expect(fmtUsdCompact(1_200_000_000, { sign: true })).toBe('+$1.2B')
    expect(fmtUsdCompact(-400_000, { sign: true })).toBe('-$400K')
  })

  it('formats a filing date', () => {
    expect(fmtFiledDate('2026-08-14')).toBe('Aug 14, 2026')
    expect(fmtFiledDate(null)).toBe('—')
  })

  it('finds the latest quarter across cards, ignoring empty ones', () => {
    expect(latestQuarter([card({ latest_quarter: '2025-09-30' }), card({ latest_quarter: null }), card()])).toBe('2026-06-30')
    expect(latestQuarter([])).toBeNull()
  })
})

describe('visibleInvestors', () => {
  const cards = [
    card({ slug: 'b', name: 'Warren Buffett', firm: 'Berkshire Hathaway', total_value: 300, positions: 29, new_count: 1, exited_count: 1 }),
    card({ slug: 's', name: 'Michael Burry', firm: 'Scion', total_value: 1, positions: 9, stale: true, new_count: 6, exited_count: 3 }),
    card({ slug: 'e', name: 'Empty Fund', firm: 'Nothing Yet', total_value: null, positions: null, new_count: null, exited_count: null }),
  ]

  it('sorts by value with empty investors last', () => {
    expect(visibleInvestors(cards, { group: 'all', query: '', sort: 'value' }).map((c) => c.slug)).toEqual(['b', 's', 'e'])
  })

  it('sorts by most changes and by name', () => {
    expect(visibleInvestors(cards, { group: 'all', query: '', sort: 'changes' }).map((c) => c.slug)).toEqual(['s', 'b', 'e'])
    expect(visibleInvestors(cards, { group: 'all', query: '', sort: 'name' }).map((c) => c.slug)).toEqual(['e', 's', 'b'])
  })

  it('keeps only stopped filers', () => {
    expect(visibleInvestors(cards, { group: 'stale', query: '', sort: 'value' }).map((c) => c.slug)).toEqual(['s'])
  })

  it('matches investor or firm, plus holders of a ticker', () => {
    expect(visibleInvestors(cards, { group: 'all', query: 'berk', sort: 'value' }).map((c) => c.slug)).toEqual(['b'])
    expect(visibleInvestors(cards, { group: 'all', query: 'aapl', sort: 'value', holderSlugs: new Set(['s']) }).map((c) => c.slug)).toEqual(['s'])
  })

  it('recognises a ticker-shaped query', () => {
    expect(looksLikeTicker('aapl')).toBe(true)
    expect(looksLikeTicker('BRK.B')).toBe(true)
    expect(looksLikeTicker('berkshire hathaway')).toBe(false)
    expect(looksLikeTicker('')).toBe(false)
  })
})

describe('holdings', () => {
  const holdings = [
    { ticker: 'AAPL', issuer: 'APPLE INC', change: 'added', put_call: '', owned: true, watched: false, value: 70, weight: 70 },
    { ticker: 'NVDA', issuer: 'NVIDIA CORP', change: 'new', put_call: 'CALL', owned: false, watched: false, value: 20, weight: 20 },
    { ticker: null, issuer: 'LIBERTY LATIN AMERICA', change: 'trimmed', put_call: '', owned: false, watched: false, value: 10, weight: 10 },
  ]

  it('filters by change, options and yours', () => {
    expect(filterHoldings(holdings, { filter: 'new', query: '' }).map((h) => h.issuer)).toEqual(['NVIDIA CORP'])
    expect(filterHoldings(holdings, { filter: 'options', query: '' }).map((h) => h.issuer)).toEqual(['NVIDIA CORP'])
    expect(filterHoldings(holdings, { filter: 'yours', query: '' }).map((h) => h.issuer)).toEqual(['APPLE INC'])
  })

  it('searches ticker or issuer, including unresolved rows', () => {
    expect(filterHoldings(holdings, { filter: 'all', query: 'liberty' }).map((h) => h.issuer)).toEqual(['LIBERTY LATIN AMERICA'])
    expect(filterHoldings(holdings, { filter: 'all', query: 'nvd' }).map((h) => h.issuer)).toEqual(['NVIDIA CORP'])
  })
})

describe('top ten', () => {
  const holdings = Array.from({ length: 12 }, (_, i) => ({ ticker: i === 3 ? null : `T${i}`, issuer: `Issuer ${i}`, value: 100 - i, weight: 8 }))
  const detail = { holdings, positions: 12, total_value: 1134, top10_weight: 80 }

  it('keeps the first ten and states the rest', () => {
    expect(topTen(holdings)).toHaveLength(10)
    expect(remainder(detail)).toEqual({ count: 2, weight: 20, value: 1134 - holdings.slice(0, 10).reduce((s, h) => s + h.value, 0) })
  })

  it('has no remainder for a small portfolio', () => {
    expect(remainder({ holdings: holdings.slice(0, 4), positions: 4, total_value: 394, top10_weight: 100 })).toBeNull()
  })

  it('builds donut slices with an Other slice and rank colours', () => {
    const slices = donutSlices(detail)
    expect(slices).toHaveLength(11)
    expect(slices[0]).toMatchObject({ name: 'T0', note: 'Issuer 0', value: 100, color: colorForRank(0), logo: true })
    expect(slices[3]).toMatchObject({ name: 'Issuer 3', logo: false })
    expect(slices[10]).toMatchObject({ name: 'Other', color: OTHER_SLICE, logo: false, weight: 20 })
  })

  it('omits the Other slice at ten positions or fewer', () => {
    expect(donutSlices({ holdings: holdings.slice(0, 4), positions: 4, total_value: 394, top10_weight: 100 })).toHaveLength(4)
  })
})

describe('top-10 view preference', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to grid and remembers a choice', () => {
    expect(readTop10View()).toBe('grid')
    writeTop10View('donut')
    expect(readTop10View()).toBe('donut')
  })

  it('ignores an unknown stored value', () => {
    localStorage.setItem('saxodash:investors-top10-view', 'pie')
    expect(readTop10View()).toBe('grid')
  })
})
