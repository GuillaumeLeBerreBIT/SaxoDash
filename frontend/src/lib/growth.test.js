import { describe, expect, it } from 'vitest'

import { GROWTH_RANGES, growthFor, lastPct } from './growth'

const rows = [
  { date: '2026-08-01', portfolio: 100, benchmark: 100 },
  { date: '2026-10-01', portfolio: 120, benchmark: 105 },
  { date: '2026-10-20', portfolio: 110, benchmark: 110 },
  { date: '2026-11-16', portfolio: 99, benchmark: 121 },
]

describe('growthFor', () => {
  it('keeps everything since the start for All', () => {
    expect(growthFor(rows, 'ALL')).toEqual(rows)
  })

  it('cuts to the range and starts both lines again at 100', () => {
    const month = growthFor(rows, '1M')
    expect(month.map((row) => row.date)).toEqual(['2026-10-20', '2026-11-16'])
    expect(month[0]).toEqual({ date: '2026-10-20', portfolio: 100, benchmark: 100 })
    expect(month[1].portfolio).toBeCloseTo(90)
    expect(month[1].benchmark).toBeCloseTo(110)
  })

  it('keeps an index gap blank', () => {
    const gappy = [{ date: '2026-11-01', portfolio: 100, benchmark: null }, { date: '2026-11-16', portfolio: 110, benchmark: 100 }]
    expect(growthFor(gappy, '1M')[1].benchmark).toBe(100)
  })

  it('is empty without rows', () => {
    expect(growthFor(undefined, '1M')).toEqual([])
  })

  it('offers three ranges', () => {
    expect(GROWTH_RANGES.map((range) => range.value)).toEqual(['1M', '3M', 'ALL'])
  })
})

describe('lastPct', () => {
  it('turns the last point into a percentage change', () => {
    expect(lastPct(rows, 'portfolio')).toBeCloseTo(-1)
    expect(lastPct(rows, 'benchmark')).toBeCloseTo(21)
    expect(lastPct([], 'portfolio')).toBeNull()
    expect(lastPct([{ portfolio: 100, benchmark: null }], 'benchmark')).toBeNull()
  })
})
