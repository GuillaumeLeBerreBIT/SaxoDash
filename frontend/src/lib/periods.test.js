import { describe, expect, it } from 'vitest'
import { periodKeyFromParam, periodParam, resolvePeriod } from './periods'

describe('resolvePeriod', () => {
  it('resolves this_month to the 1st of the month through today', () => {
    const period = resolvePeriod('this_month', new Date(2026, 8, 19))
    expect(period.date_from).toBe('2026-09-01')
    expect(period.date_to).toBe('2026-09-19')
    expect(period.label).toBe('September 2026')
  })

  it('resolves last_month to the full previous calendar month', () => {
    const period = resolvePeriod('last_month', new Date(2026, 8, 19))
    expect(period.date_from).toBe('2026-08-01')
    expect(period.date_to).toBe('2026-08-31')
    expect(period.label).toBe('August 2026')
  })

  it('resolves last_3_months to the 1st of two months ago through today', () => {
    const period = resolvePeriod('last_3_months', new Date(2026, 8, 19))
    expect(period.date_from).toBe('2026-07-01')
    expect(period.date_to).toBe('2026-09-19')
  })

  it('handles a year boundary for last_month', () => {
    const period = resolvePeriod('last_month', new Date(2026, 0, 15))
    expect(period.date_from).toBe('2025-12-01')
    expect(period.date_to).toBe('2025-12-31')
  })
})

describe('period in the URL', () => {
  it('reads the short and the long names of a preset', () => {
    expect(periodKeyFromParam('3m')).toBe('last_3_months')
    expect(periodKeyFromParam('1m')).toBe('last_month')
    expect(periodKeyFromParam('last_3_months')).toBe('last_3_months')
    expect(periodKeyFromParam('last_month')).toBe('last_month')
  })

  it('falls back to this month for a missing or unknown value', () => {
    expect(periodKeyFromParam(null)).toBe('this_month')
    expect(periodKeyFromParam('custom')).toBe('this_month')
    expect(periodKeyFromParam('12y')).toBe('this_month')
  })

  it('writes the short name back, and nothing for the default', () => {
    expect(periodParam('last_3_months')).toBe('3m')
    expect(periodParam('last_month')).toBe('1m')
    expect(periodParam('this_month')).toBeNull()
    expect(periodParam('custom')).toBeNull()
  })
})
