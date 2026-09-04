import { describe, expect, it } from 'vitest'
import { bollinger, computeIndicators, computeIndicatorsForRange, ema, macd, rsi, sma, vwapSeries } from './indicators'

const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const bars = (values) =>
  values.map((close, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
  }))

describe('sma', () => {
  it('is null until the window is full, then averages it', () => {
    const out = sma(closes, 3)

    expect(out.slice(0, 2)).toEqual([null, null])
    expect(out[2]).toBe(2)
    expect(out[9]).toBe(9)
  })

  it('returns one value per input bar', () => {
    expect(sma(closes, 3)).toHaveLength(closes.length)
  })
})

describe('ema', () => {
  it('is null until the period is reached and then tracks the series', () => {
    const out = ema(closes, 3)

    expect(out.slice(0, 2)).toEqual([null, null])
    expect(out[9]).toBeGreaterThan(out[5])
    expect(out[9]).toBeLessThan(10)
  })
})

describe('bollinger', () => {
  it('centres on the simple moving average', () => {
    const band = bollinger(closes, 5)

    expect(band.mid).toEqual(sma(closes, 5))
  })

  it('brackets the middle band', () => {
    const band = bollinger(closes, 5)

    expect(band.up[9]).toBeGreaterThan(band.mid[9])
    expect(band.lo[9]).toBeLessThan(band.mid[9])
  })
})

describe('rsi', () => {
  it('stays inside 0-100', () => {
    const noisy = [10, 12, 11, 14, 13, 17, 15, 19, 18, 22, 20, 25, 23, 28, 26, 30]

    for (const value of rsi(noisy).filter((v) => v != null)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(100)
    }
  })

  it('pins to 100 for a series that only rises', () => {
    const rising = Array.from({ length: 20 }, (_, i) => 100 + i)
    const out = rsi(rising)

    expect(out[19]).toBeCloseTo(100, 5)
  })

  it('has no value before its period has elapsed', () => {
    expect(rsi(closes, 14).every((v) => v == null)).toBe(true)
  })
})

describe('macd', () => {
  it('returns three series as long as the input', () => {
    const out = macd(closes)

    expect(out.line).toHaveLength(closes.length)
    expect(out.signal).toHaveLength(closes.length)
    expect(out.hist).toHaveLength(closes.length)
  })

  it('lines up the signal with the bars the macd line covers', () => {
    const long = Array.from({ length: 60 }, (_, i) => 100 + i)
    const out = macd(long)

    // Signal exists only where the line does, never before it.
    out.signal.forEach((v, i) => {
      if (v != null) expect(out.line[i]).not.toBeNull()
    })
  })
})

describe('vwapSeries', () => {
  it('sits inside the price range of the bars', () => {
    const out = vwapSeries(bars(closes))

    expect(out[9]).toBeGreaterThan(0)
    expect(out[9]).toBeLessThanOrEqual(10)
  })

  it('is null rather than NaN when no volume has traded', () => {
    const noVolume = bars(closes).map((bar) => ({ ...bar, volume: 0 }))

    expect(vwapSeries(noVolume)[0]).toBeNull()
  })
})

describe('computeIndicators', () => {
  it('returns every series the chart can draw', () => {
    const out = computeIndicators(bars(closes))

    expect(Object.keys(out).sort()).toEqual(
      ['bb', 'ema9', 'ma20', 'ma50', 'macd', 'rsi', 'vwap'].sort(),
    )
  })

  it('survives an empty dataset', () => {
    const out = computeIndicators([])

    expect(out.ma20).toEqual([])
    expect(out.macd.line).toEqual([])
  })
})

describe('computeIndicatorsForRange', () => {
  const bars = Array.from({ length: 120 }, (_, i) => ({
    high: 102 + i,
    low: 98 + i,
    close: 100 + i,
    volume: 1000,
  }))

  it('gives the visible bars a value the range alone could not warm up', () => {
    const ranged = computeIndicatorsForRange(bars, 22)
    const rangeOnly = computeIndicators(bars.slice(-22))

    expect(ranged.ma50).toHaveLength(22)
    expect(ranged.ma50.every((v) => v != null)).toBe(true)
    expect(rangeOnly.ma50.every((v) => v == null)).toBe(true)
  })

  it('lines the sliced series up with the bars they belong to', () => {
    const ranged = computeIndicatorsForRange(bars, 22)
    const full = computeIndicators(bars)

    expect(ranged.ma20).toEqual(full.ma20.slice(-22))
    expect(ranged.rsi).toEqual(full.rsi.slice(-22))
    expect(ranged.macd.line).toEqual(full.macd.line.slice(-22))
    expect(ranged.bb.up).toEqual(full.bb.up.slice(-22))
  })

  it('keeps VWAP anchored to the visible range, since it is cumulative', () => {
    const ranged = computeIndicatorsForRange(bars, 22)
    const rangeOnly = computeIndicators(bars.slice(-22))

    expect(ranged.vwap).toEqual(rangeOnly.vwap)
    expect(ranged.vwap).not.toEqual(computeIndicators(bars).vwap.slice(-22))
  })

  it('returns the whole series when the range is wider than the data', () => {
    expect(computeIndicatorsForRange(bars, 500).ma20).toHaveLength(bars.length)
  })
})
