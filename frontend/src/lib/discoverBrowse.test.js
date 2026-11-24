import { describe, expect, it } from 'vitest'

import { EMPTY_FILTERS, browseQuery, checksLine, fallLine, filtersActive, filtersFromParams, paramsFromFilters, priceLine, qualityCount, toggled } from './discoverBrowse'

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
    expect(filtersFromParams(new URLSearchParams('sort=random')).sort).toBe('checks')
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
  it('uses the filtered grade for the price description', () => {
    expect(priceLine({ valuation: 'cheap', discount_pct: 55.4 })).toBe('55% below its usual P/E range')
    expect(priceLine({ valuation: 'cheap', discount_pct: 0.2 })).toBe('Below its usual P/E range')
    expect(priceLine({ valuation: 'fair', below_high_pct: 31 })).toBe('Within its usual P/E range')
    expect(priceLine({ valuation: 'expensive' })).toBe('Above its usual P/E range')
    expect(priceLine({ valuation: 'not_judged', below_high_pct: 31.2 })).toBe('31% below its 1-year high')
    expect(priceLine({ valuation: 'not_judged' })).toBeNull()
  })

  it('states the fall from the 1-year high whatever the P/E zone, and only when there is one', () => {
    expect(fallLine({ valuation: 'fair', below_high_pct: 38.4 })).toBe('38% below its 1-year high')
    expect(fallLine({ valuation: 'cheap', below_high_pct: 25 })).toBe('25% below its 1-year high')
    expect(fallLine({ valuation: 'fair', below_high_pct: 0 })).toBeNull()
    expect(fallLine({ valuation: 'fair', below_high_pct: null })).toBeNull()
  })

  it('counts only assessed checks and leaves missing counts out', () => {
    expect(qualityCount({ checks_passed: 4, checks_answered: 5 })).toBe('4 of 5 quality checks passed')
    expect(qualityCount({ checks_passed: 0, checks_answered: 0 })).toBeNull()
    expect(qualityCount({ checks_answered: 5 })).toBeNull()
  })

  it('pairs recorded growth with a failed check and skips unanswered checks', () => {
    expect(checksLine({ revenue_growth_5y: 8.24, failed_checks: ['Debt'] }))
      .toBe('Five-year revenue growth was 8.2% a year. Misses the debt check.')
    expect(checksLine({ revenue_growth_5y: null })).toBe('Too few figures to judge the business.')
    expect(checksLine({ failed_checks: ['Debt'] })).toBe('Misses the debt check.')
    expect(checksLine({ passed_checks: ['Return on equity'] })).toBe('Passes on return on equity.')
    expect(checksLine({ failed_checks: ['Debt', 'Margins', 'Revenue growth'] })).toBe('Misses 3 checks, including debt and margins.')
    expect(checksLine({ revenue_growth_5y: 0 })).toContain('0.0%')
  })
})
