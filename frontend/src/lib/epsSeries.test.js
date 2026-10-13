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

  it('labels rows that know their fiscal quarter, reported and upcoming alike', () => {
    const rows = quarterlyEpsRows(
      [{ date: '2026-06-30', quarter: 2, year: 2026, eps_actual: 1, eps_estimate: 1 }],
      [{ date: '2026-11-02', quarter: 3, year: 2026, eps_estimate: 1.1 }],
    )

    expect(rows.map((row) => row.period)).toEqual(['Q2 FY26', 'Q3 FY26'])
  })

  it('falls back to the month for a row without a fiscal quarter', () => {
    const rows = quarterlyEpsRows([{ date: '2026-03-31', quarter: null, year: null, eps_actual: 1 }], [])

    expect(rows[0].period).toBe('2026-03')
  })

  it('makes duplicate labels unique by falling the later one back to its month', () => {
    const rows = quarterlyEpsRows(
      [
        { date: '2026-03-31', quarter: 1, year: 2026, eps_actual: 1 },
        { date: '2026-04-02', quarter: 1, year: 2026, eps_actual: 2 },
      ],
      [],
    )

    expect(rows.map((row) => row.period)).toEqual(['Q1 FY26', '2026-04'])
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
  const annual = [
    { period: '2024-01-28', eps: 1.19 },
    { period: '2025-01-26', eps: 2.94 },
  ]

  it('labels each split-adjusted point with its fiscal year', () => {
    expect(annualEpsRows(annual)).toEqual([
      { period: 'FY 2024', actual: 1.19, estimate: null, surprise: null, forward: false },
      { period: 'FY 2025', actual: 2.94, estimate: null, surprise: null, forward: false },
    ])
  })

  it('uses the month for two points that share a year', () => {
    const rows = annualEpsRows([
      { period: '2023-01-29', eps: 1 },
      { period: '2023-12-31', eps: 2 },
      { period: '2024-12-31', eps: 3 },
    ])

    expect(rows.map((row) => row.period)).toEqual(['Jan 23', 'Dec 23', 'FY 2024'])
  })

  it('is empty for a missing input', () => {
    expect(annualEpsRows(undefined)).toEqual([])
  })
})
