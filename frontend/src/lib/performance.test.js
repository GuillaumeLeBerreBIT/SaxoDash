import { describe, it, expect } from 'vitest'
import { toGainersLosersData } from './performance'

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
