import { describe, expect, it } from 'vitest'

import { comparablePeriods, performanceSentence } from './performanceAnswer'

const period = (label, portfolio, benchmark) => ({
  label,
  portfolio_pct: portfolio,
  benchmark_pct: benchmark,
  alpha_pct: portfolio == null || benchmark == null ? null : portfolio - benchmark,
})

describe('performanceSentence', () => {
  it('uses the longest period that has both figures and says ahead', () => {
    const periods = [period('1 month', 4.2, 2.1), period('3 months', 9, 5.5), period('1 year', null, null)]
    expect(performanceSentence(periods, 'World Index')).toBe(
      'Over 3 months your Investment Return was +9.0%, 3.5 points ahead of World Index (+5.5%).',
    )
  })

  it('says behind when the index did better', () => {
    expect(performanceSentence([period('Since inception', -2, 3.4)], 'S&P 500')).toBe(
      'Since inception your Investment Return was -2.0%, 5.4 points behind S&P 500 (+3.4%).',
    )
  })

  it('says in line when the gap rounds to nothing', () => {
    expect(performanceSentence([period('Year to date', 3.02, 3.0)], 'World Index')).toBe(
      'Year to date your Investment Return was +3.0%, in line with World Index (+3.0%).',
    )
  })

  it('gives the portfolio return alone when the index has no figure', () => {
    expect(performanceSentence([period('1 month', 4.2, null)], 'World Index')).toBe(
      'Over 1 month your Investment Return was +4.2%. World Index has no figure for that period.',
    )
  })

  it('says there is not enough history when no period has a return', () => {
    expect(performanceSentence([period('1 month', null, null)], 'World Index')).toBe(
      'Not enough history yet to state a return.',
    )
    expect(performanceSentence(undefined, 'World Index')).toBe('Not enough history yet to state a return.')
  })
})

describe('comparablePeriods', () => {
  it('keeps the periods with a portfolio return and counts the rest', () => {
    const periods = [period('1 month', 4.2, 2.1), period('1 year', null, null), period('3 years', null, null)]
    expect(comparablePeriods(periods)).toEqual({ shown: [periods[0]], waiting: 2 })
  })
})
