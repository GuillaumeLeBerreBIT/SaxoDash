import { describe, expect, it } from 'vitest'
import { bollinger, computeIndicators, computeIndicatorsForRange, computeIndicatorsForWindow, ema, macd, relativeVolume, rollingHigh, rsi, sma, volumeGaps, vwapSeries } from './indicators'

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

describe('relativeVolume', () => {
  const withVolumes = (volumes) => volumes.map((volume, i) => ({ ...bars([10])[0], date: `d${i}`, volume }))

  it('compares a bar with the 20 sessions before it, not including itself', () => {
    expect(relativeVolume(withVolumes([...Array(20).fill(100), 300]))[20]).toBe(3)
  })

  it('has no reading until 15 sessions of history exist', () => {
    const rvol = relativeVolume(withVolumes(Array(16).fill(100)))
    expect(rvol.slice(0, 15).every((v) => v == null)).toBe(true)
    expect(rvol[15]).toBe(1)
  })

  it('treats zero volume as missing, not as a quiet day', () => {
    expect(relativeVolume(withVolumes([...Array(15).fill(100), ...Array(5).fill(0), 200]))[20]).toBe(2)
  })

  it('gives no reading when too many prior sessions are missing', () => {
    expect(relativeVolume(withVolumes([...Array(14).fill(100), ...Array(6).fill(0), 200]))[20]).toBeNull()
  })

  it('gives no reading for a bar with no volume of its own', () => {
    expect(relativeVolume(withVolumes([...Array(20).fill(100), 0]))[20]).toBeNull()
  })
})

describe('computeIndicators', () => {
  it('returns every series the chart can draw', () => {
    const out = computeIndicators(bars(closes))

    expect(Object.keys(out).sort()).toEqual(
      ['bb', 'ema9', 'ma20', 'ma50', 'ma200', 'macd', 'rsi', 'rvol', 'vwap'].sort(),
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

  it('warms relative volume up on the bars before the visible range', () => {
    const series = Array.from({ length: 40 }, (_, i) => ({
      high: 102 + i,
      low: 98 + i,
      close: 100 + i,
      volume: i === 39 ? 2000 : 1000,
    }))
    const ranged = computeIndicatorsForRange(series, 5)
    expect(ranged.rvol).toHaveLength(5)
    expect(ranged.rvol[4]).toBe(2)
  })
})

describe('computeIndicatorsForWindow', () => {
  const bars = Array.from({ length: 120 }, (_, i) => ({
    high: 102 + i + (i % 3),
    low: 98 + i,
    close: 100 + i + (i % 5),
    volume: 1000 + (i % 7) * 100,
  }))
  const window = { start: 50, end: 72 }

  it('lines a panned window up with the full-history values', () => {
    const panned = computeIndicatorsForWindow(bars, window)
    const full = computeIndicators(bars)

    expect(panned.ma50).toEqual(full.ma50.slice(50, 72))
    expect(panned.ema9).toEqual(full.ema9.slice(50, 72))
    expect(panned.rsi).toEqual(full.rsi.slice(50, 72))
    expect(panned.macd.hist).toEqual(full.macd.hist.slice(50, 72))
    expect(panned.bb.lo).toEqual(full.bb.lo.slice(50, 72))
    expect(panned.rvol).toEqual(full.rvol.slice(50, 72))
  })

  it('restarts VWAP at the first visible bar', () => {
    expect(computeIndicatorsForWindow(bars, window).vwap).toEqual(computeIndicators(bars.slice(50, 72)).vwap)
  })
})

describe('rollingHigh', () => {
  const series = (count) =>
    Array.from({ length: count }, (_, i) => ({ high: i === 0 ? 500 : 100 + i }))

  it('is null until a full window of bars exists', () => {
    expect(rollingHigh(series(251)).every((value) => value === null)).toBe(true)
  })

  it('takes the highest high of the trailing window, inclusive', () => {
    const out = rollingHigh(series(253))

    expect(out[250]).toBeNull()
    expect(out[251]).toBe(500)
    expect(out[252]).toBe(100 + 252)
  })
})

describe('volumeGaps', () => {
  const quiet = (count) =>
    Array.from({ length: count }, (_, i) => ({ date: `d${i}`, open: 10, high: 10.1, low: 9.95, close: 10, volume: 100 }))
  const withBar = (count, index, bar) => {
    const list = quiet(count)
    list[index] = { ...list[index], ...bar }
    for (let i = index + 1; i < count; i++) {
      list[i] = { ...list[i], open: bar.close, high: bar.close + 0.05, low: bar.close - 0.05, close: bar.close }
    }
    return list
  }
  const gapBar = { open: 10.5, high: 10.6, low: 10.4, close: 10.4, volume: 300 }

  it('reports a gap up with the previous close, the open and its relative volume', () => {
    const gaps = volumeGaps(withBar(40, 25, gapBar))

    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ index: 25, up: true, from: 10, to: 10.5, end: 39, filled: false })
    expect(gaps[0].rvol).toBeCloseTo(3)
  })

  it('ends the box at the first later bar trading back to the previous close', () => {
    const bars = withBar(40, 25, gapBar)
    bars[30] = { ...bars[30], low: 9.9 }

    expect(volumeGaps(bars)[0]).toMatchObject({ end: 30, filled: true })
  })

  it('caps the box at 60 sessions when it never fills', () => {
    const gaps = volumeGaps(withBar(120, 25, gapBar))

    expect(gaps[0]).toMatchObject({ end: 85, filled: false })
  })

  it('ignores a fill later than 60 sessions after the gap', () => {
    const bars = withBar(120, 25, gapBar)
    bars[100] = { ...bars[100], low: 9.9 }

    expect(volumeGaps(bars)[0]).toMatchObject({ end: 85, filled: false })
  })

  it('needs a gap of more than 4%', () => {
    expect(volumeGaps(withBar(40, 25, { ...gapBar, open: 10.3, close: 10.3 }))).toEqual([])
  })

  it('needs the close to hold at least 98% of the open for a gap up', () => {
    expect(volumeGaps(withBar(40, 25, { ...gapBar, close: 10.2 }))).toEqual([])
  })

  it('measures usual volume on the previous 20 bars only', () => {
    const gaps = volumeGaps(withBar(40, 25, { ...gapBar, volume: 210 }))

    expect(gaps).toHaveLength(1)
    expect(gaps[0].rvol).toBeCloseTo(2.1)
  })

  it('needs heavy volume', () => {
    expect(volumeGaps(withBar(40, 25, { ...gapBar, volume: 150 }))).toEqual([])
  })

  it('reports a gap down and fills it when the high returns to the previous close', () => {
    const bars = withBar(40, 25, { open: 9.5, high: 9.6, low: 9.4, close: 9.5, volume: 300 })
    bars[28] = { ...bars[28], high: 10.2 }

    expect(volumeGaps(bars)[0]).toMatchObject({ index: 25, up: false, from: 10, to: 9.5, end: 28, filled: true })
  })

  it('does not look for gaps in the first 20 bars', () => {
    expect(volumeGaps(withBar(40, 10, gapBar))).toEqual([])
  })

  it('keeps only gaps in the last 252 bars', () => {
    const bars = withBar(400, 25, gapBar)
    bars[390] = { ...bars[390], open: 11, high: 11.1, low: 10.9, close: 11, volume: 300 }

    expect(volumeGaps(bars).map((gap) => gap.index)).toEqual([390])
  })
})
