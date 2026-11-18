import { describe, expect, it } from 'vitest'

import { EMPTY_FILTERS, browseQuery, checksLine, filtersActive, filtersFromParams, paramsFromFilters, priceLine, toggled } from './discoverBrowse'

describe('filters and the URL', () => {
  it('round-trips through search params', () => {
    const filters = { ...EMPTY_FILTERS, valuation: ['cheap'], sector: ['Health Care', 'Energy'], minYield: 3, notHeld: true, q: 'nv', sort: 'fall' }
    const back = filtersFromParams(new URLSearchParams(paramsFromFilters(filters)))
    expect(back).toEqual(filters)
  })

  it('reads an empty URL as no filters and the default sort', () => {
    expect(filtersFromParams(new URLSearchParams(''))).toEqual(EMPTY_FILTERS)
  })

  it('ignores a sort it does not know', () => {
    expect(filtersFromParams(new URLSearchParams('sort=random')).sort).toBe('opportunity')
  })

  it('counts sorting alone as no filter, so the shelves stay', () => {
    expect(filtersActive({ ...EMPTY_FILTERS, sort: 'fall' })).toBe(false)
    expect(filtersActive({ ...EMPTY_FILTERS, quality: ['strong'] })).toBe(true)
    expect(filtersActive({ ...EMPTY_FILTERS, q: '  ' })).toBe(false)
  })
})

describe('browseQuery', () => {
  it('adds paging, exclusions and a ticker list to the filters', () => {
    const query = browseQuery({ ...EMPTY_FILTERS, quality: ['strong'] }, { exclude: ['AAA'], tickers: ['BBB'], limit: 4, offset: 8 })
    expect(new URLSearchParams(query.slice(1)).toString()).toBe('quality=strong&exclude=AAA&tickers=BBB&limit=4&offset=8')
  })

  it('is empty without anything to ask', () => {
    expect(browseQuery(EMPTY_FILTERS)).toBe('')
  })
})

describe('toggled', () => {
  it('adds a value that is missing and removes one that is there', () => {
    expect(toggled(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggled(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('card lines', () => {
  it('leads with how far below its usual P/E range a stock is, without calling it good', () => {
    expect(priceLine({ discount_pct: 55.4, below_high_pct: 40 })).toEqual({ text: '55% below its usual P/E range', tone: 'neutral' })
  })

  it('falls back to the fall from the high, then to the valuation word', () => {
    expect(priceLine({ discount_pct: -5, below_high_pct: 31.2, valuation: 'fair' })).toEqual({ text: '31% below its 1-year high', tone: 'neutral' })
    expect(priceLine({ discount_pct: null, below_high_pct: 2, valuation: 'expensive' })).toEqual({ text: 'Above its usual P/E range', tone: 'neutral' })
    expect(priceLine({ valuation: 'not_judged' })).toBeNull()
  })

  it('says how many checks pass and names the ones that fail', () => {
    expect(checksLine({ checks_passed: 7, checks_answered: 7, failed_checks: [] })).toBe('7 of 7 quality checks pass.')
    expect(checksLine({ checks_passed: 6, checks_answered: 7, failed_checks: ['Debt'] })).toBe('6 of 7 quality checks pass; debt fails.')
    expect(checksLine({ checks_passed: 0, checks_answered: 0, failed_checks: [] })).toBe('Too few figures to judge the business.')
  })
})
