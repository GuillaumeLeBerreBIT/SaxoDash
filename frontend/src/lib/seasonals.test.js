import { describe, expect, it } from 'vitest'

import { seasonalSeries } from './seasonals'

const bar = (date, close) => ({ date, close })

describe('seasonalSeries', () => {
  it('draws each full year from its own first close', () => {
    const series = seasonalSeries([
      bar('2025-01-02', 100),
      bar('2025-06-30', 150),
      bar('2026-01-02', 200),
      bar('2026-02-01', 180),
    ])

    expect(series.map((row) => row.year)).toEqual([2025, 2026])
    expect(series[0].points).toEqual([
      { day: 2, pct: 0 },
      { day: 181, pct: 50 },
    ])
    expect(series[1].points[1].day).toBe(32)
    expect(series[1].points[1].pct).toBeCloseTo(-10, 5)
  })

  it('drops a year whose history starts after January', () => {
    const series = seasonalSeries([bar('2024-03-15', 50), bar('2024-12-30', 60), bar('2025-01-02', 100)])
    expect(series.map((row) => row.year)).toEqual([2025])
  })

  it('drops a year whose first bar falls after the first week of January', () => {
    const series = seasonalSeries([bar('2024-01-20', 50), bar('2024-12-30', 60), bar('2025-01-02', 100)])
    expect(series.map((row) => row.year)).toEqual([2025])
  })

  it('keeps a year whose first bar falls in the first week of January', () => {
    const series = seasonalSeries([bar('2024-01-02', 50), bar('2024-12-30', 60)])
    expect(series.map((row) => row.year)).toEqual([2024])
  })

  it('drops a year whose first close is zero', () => {
    const series = seasonalSeries([bar('2025-01-02', 0), bar('2025-02-02', 10), bar('2026-01-05', 20)])
    expect(series.map((row) => row.year)).toEqual([2026])
  })

  it('answers an empty list without bars', () => {
    expect(seasonalSeries([])).toEqual([])
  })
})
