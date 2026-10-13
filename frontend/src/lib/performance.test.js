import { describe, it, expect } from 'vitest'
import { toGainersLosersData, trailingReturns } from './performance'

describe('toGainersLosersData', () => {
  it('maps positions to ticker + numeric pnlPct', () => {
    const result = toGainersLosersData([{ ticker: 'NVDA', pnl_pct: '50.00' }])
    expect(result).toEqual([{ ticker: 'NVDA', pnlPct: 50 }])
  })

  it('sorts descending by pnlPct (best first)', () => {
    const result = toGainersLosersData([
      { ticker: 'A', pnl_pct: '10.00' },
      { ticker: 'B', pnl_pct: '80.00' },
      { ticker: 'C', pnl_pct: '-5.00' },
    ])
    expect(result.map((r) => r.ticker)).toEqual(['B', 'A', 'C'])
  })

  it('handles negative (loss) values', () => {
    const result = toGainersLosersData([{ ticker: 'L', pnl_pct: '-20.00' }])
    expect(result[0].pnlPct).toBe(-20)
  })

  it('returns empty array for no positions', () => {
    expect(toGainersLosersData([])).toEqual([])
  })
})

const bar = (date, close) => ({ date, open: close, high: close, low: close, close, volume: 1 })
const byKey = (rows) => Object.fromEntries(rows.map((row) => [row.key, row.pct]))

describe('trailingReturns', () => {
  const bars = [
    bar('2025-10-10', 80),
    bar('2025-12-31', 100),
    bar('2026-04-09', 50),
    bar('2026-07-09', 160),
    bar('2026-09-09', 125),
    bar('2026-10-02', 190),
    bar('2026-10-09', 200),
  ]

  it('measures each window from the close on or before its start date', () => {
    const result = byKey(trailingReturns(bars))
    expect(result['1W']).toBeCloseTo(5.263, 2)
    expect(result['1M']).toBeCloseTo(60, 5)
    expect(result['3M']).toBeCloseTo(25, 5)
    expect(result['6M']).toBeCloseTo(300, 5)
    expect(result.YTD).toBeCloseTo(100, 5)
    expect(result['1Y']).toBeNull()
  })

  it('keeps the window order', () => {
    expect(trailingReturns(bars).map((row) => row.key)).toEqual(['1W', '1M', '3M', '6M', 'YTD', '1Y'])
  })

  it('answers null for every window without bars', () => {
    expect(trailingReturns([]).every((row) => row.pct === null)).toBe(true)
  })

  it('clamps a month shift to the last day of a shorter month', () => {
    const result = byKey(trailingReturns([bar('2026-02-27', 100), bar('2026-03-02', 400), bar('2026-03-31', 200)]))
    expect(result['1M']).toBeCloseTo(100, 5)
  })
})
