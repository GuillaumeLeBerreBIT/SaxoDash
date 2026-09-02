import { describe, expect, it } from 'vitest'
import {
  barChange,
  periodChange,
  quotesByUic,
  rangeStats,
  resolveInstrument,
  saxoAssetType,
} from './research'

const bars = [
  { date: '2026-08-01', open: 10, high: 12, low: 9, close: 11, volume: 1_000_000 },
  { date: '2026-08-02', open: 11, high: 15, low: 10, close: 14, volume: 3_000_000 },
  { date: '2026-08-03', open: 14, high: 14, low: 12, close: 13, volume: 2_000_000 },
]

describe('saxoAssetType', () => {
  it('prefers the type Saxo itself sent', () => {
    expect(saxoAssetType({ asset_type: 'Etf', type: 'STOCK' })).toBe('Etf')
  })

  it('translates the app label for positions synced before uic existed', () => {
    expect(saxoAssetType({ type: 'ETF' })).toBe('Etf')
    expect(saxoAssetType({ type: 'STOCK' })).toBe('Stock')
  })

  it('is null without a position', () => {
    expect(saxoAssetType(null)).toBeNull()
  })
})

describe('resolveInstrument', () => {
  it('answers from the portfolio without needing a search', () => {
    const positions = [{ ticker: 'NVDA', uic: 211, asset_type: 'Stock' }]

    expect(resolveInstrument({ symbol: 'NVDA', positions, results: [] })).toEqual({
      uic: 211,
      assetType: 'Stock',
    })
  })

  it('falls back to the exact search match when a position has no uic', () => {
    const positions = [{ ticker: 'NVDA', uic: null, type: 'STOCK' }]
    const results = [
      { symbol: 'NVDAX', uic: 99, asset_type: 'Stock' },
      { symbol: 'NVDA', uic: 211, asset_type: 'Stock' },
    ]

    expect(resolveInstrument({ symbol: 'NVDA', positions, results })).toEqual({
      uic: 211,
      assetType: 'Stock',
    })
  })

  it('takes the first result when nothing matches exactly', () => {
    const results = [{ symbol: 'NVDA:xnas', uic: 211, asset_type: 'Stock' }]

    expect(resolveInstrument({ symbol: 'NVDA', results })).toEqual({ uic: 211, assetType: 'Stock' })
  })

  it('is null when neither source can resolve the symbol', () => {
    expect(resolveInstrument({ symbol: 'NOPE', positions: [], results: [] })).toBeNull()
  })
})

describe('quotesByUic', () => {
  it('indexes quotes for constant-time lookup', () => {
    const map = quotesByUic([{ uic: 211, price: 1 }, { uic: 212, price: 2 }])

    expect(map.get(212).price).toBe(2)
    expect(map.get(999)).toBeUndefined()
  })

  it('handles no quotes at all', () => {
    expect(quotesByUic().size).toBe(0)
  })
})

describe('rangeStats', () => {
  it('summarises the loaded candles', () => {
    const stats = rangeStats(bars)

    expect(stats.high).toBe(15)
    expect(stats.low).toBe(9)
    expect(stats.last).toBe(13)
    expect(stats.avgVolume).toBe(2_000_000)
  })

  it('places the last close inside the range', () => {
    expect(rangeStats(bars).positionInRange).toBeCloseTo(((13 - 9) / (15 - 9)) * 100)
  })

  it('is null without candles', () => {
    expect(rangeStats([])).toBeNull()
  })
})

describe('periodChange', () => {
  it('measures first close to last close', () => {
    expect(periodChange(bars)).toBeCloseTo(((13 - 11) / 11) * 100)
  })

  it('needs two bars', () => {
    expect(periodChange([bars[0]])).toBeNull()
  })
})

describe('barChange', () => {
  it('measures a bar against the one before it', () => {
    expect(barChange(bars, 1)).toBeCloseTo(((14 - 11) / 11) * 100)
  })

  it('defaults to the last bar', () => {
    expect(barChange(bars)).toBeCloseTo(((13 - 14) / 14) * 100)
  })

  it('is null for the first bar, which has nothing to compare against', () => {
    expect(barChange(bars, 0)).toBeNull()
  })
})
