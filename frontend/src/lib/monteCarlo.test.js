import { describe, expect, it } from 'vitest'
import { monteCarlo } from './monteCarlo'

const BASE = { start: 10000, monthly: 500, years: 1, expectedReturnPct: 8, volatilityPct: 15, paths: 200, seed: 42 }

describe('monteCarlo', () => {
  it('is deterministic for a fixed seed', () => {
    const a = monteCarlo(BASE)
    const b = monteCarlo(BASE)
    expect(a).toEqual(b)
  })

  it('starts at the given balance and ends after the requested years', () => {
    const rows = monteCarlo(BASE)
    expect(rows[0].month).toBe(0)
    expect(rows[0].p50).toBeCloseTo(BASE.start, 0)
    expect(rows[rows.length - 1].month).toBe(12)
  })

  it('keeps percentiles ordered at every sampled month', () => {
    const rows = monteCarlo(BASE)
    for (const row of rows) {
      expect(row.p10).toBeLessThanOrEqual(row.p25)
      expect(row.p25).toBeLessThanOrEqual(row.p50)
      expect(row.p50).toBeLessThanOrEqual(row.p75)
      expect(row.p75).toBeLessThanOrEqual(row.p90)
    }
  })

  it('invested is the starting balance plus contributions, uncompounded', () => {
    const rows = monteCarlo(BASE)
    const last = rows[rows.length - 1]
    expect(last.invested).toBeCloseTo(BASE.start + BASE.monthly * 12, 0)
  })

  it('collapses to compound growth with no contribution and no volatility', () => {
    const rows = monteCarlo({
      start: 1000, monthly: 0, years: 1, expectedReturnPct: 12, volatilityPct: 0, paths: 5, seed: 1,
    })
    const last = rows[rows.length - 1]
    const expected = 1000 * Math.pow(1.12, 1)
    expect(last.p50).toBeCloseTo(expected, 0)
    expect(last.p10).toBeCloseTo(expected, 0)
    expect(last.p90).toBeCloseTo(expected, 0)
  })
})
