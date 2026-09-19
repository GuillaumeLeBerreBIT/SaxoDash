import { describe, expect, it } from 'vitest'
import { resolvePeriod } from './periods'

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
