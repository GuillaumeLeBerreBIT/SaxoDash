import { describe, expect, it } from 'vitest'

import { annualEpsRows, quarterlyEpsRows } from './epsSeries'

const history = [
  { date: '2026-03-31', eps_actual: 0.91, eps_estimate: 0.96, eps_surprise_pct: -5.2 },
  { date: '2026-06-30', eps_actual: 0.99, eps_estimate: 0.96, eps_surprise_pct: 3.1 },
]
const upcoming = [
  { date: '2026-11-02', eps_estimate: 1.02 },
  { date: '2027-01-27', eps_estimate: 1.1 },
]

describe('quarterlyEpsRows', () => {
  it('puts reported quarters first and upcoming ones after', () => {
    const rows = quarterlyEpsRows(history, upcoming)

    expect(rows.map((row) => [row.period, row.actual, row.estimate, row.forward])).toEqual([
      ['2026-03', 0.91, 0.96, false],
      ['2026-06', 0.99, 0.96, false],
      ['2026-11', null, 1.02, true],
      ['2027-01', null, 1.1, true],
    ])
    expect(rows[0].surprise).toBe(-5.2)
    expect(rows[2].surprise).toBeNull()
  })

  it('leaves out an upcoming quarter with no estimate', () => {
    expect(quarterlyEpsRows(history, [{ date: '2026-11-02', eps_estimate: null }])).toHaveLength(2)
  })

  it('works without an upcoming list', () => {
    expect(quarterlyEpsRows(history, undefined)).toHaveLength(2)
    expect(quarterlyEpsRows(undefined, undefined)).toEqual([])
  })
})

describe('annualEpsRows', () => {
  const annual = Array.from({ length: 10 }, (_, index) => ({
    label: `FY ${2016 + index}`,
    income: index === 3 ? {} : { eps_diluted: 1 + index },
  }))

  it('lists diluted EPS for the newest eight years that report it', () => {
    const rows = annualEpsRows(annual)

    expect(rows).toHaveLength(8)
    expect(rows[0].period).toBe('FY 2017')
    expect(rows.at(-1)).toEqual({ period: 'FY 2025', actual: 10, estimate: null, surprise: null, forward: false })
    expect(rows.map((row) => row.period)).not.toContain('FY 2019')
  })

  it('is empty for a missing input', () => {
    expect(annualEpsRows(undefined)).toEqual([])
  })
})
