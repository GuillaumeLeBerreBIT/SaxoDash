import { describe, expect, it } from 'vitest'

import { SP500, compareLines, compareSuggestions, compareTicks, factSentence, pricesFor, valueAt } from './compare'

const bar = (date, close) => ({ date, open: close, high: close, low: close, close })

const nvda = [bar('2026-06-01', 100), bar('2026-06-02', 110), bar('2026-06-03', 121), bar('2026-06-04', 120)]
const spy = [bar('2026-05-29', 400), bar('2026-06-01', 500), bar('2026-06-02', 505), bar('2026-06-03', 510), bar('2026-06-04', 525)]

const main = { key: 'main', label: 'NVDA', bars: nvda }

describe('compareLines', () => {
  it('starts every line at 0% on the first visible day', () => {
    const [stock, index] = compareLines(main, [{ key: 'sp500', label: 'S&P 500', bars: spy }])
    expect(stock.values[0]).toBe(0)
    expect(index.values[0]).toBe(0)
    expect(stock.values[2]).toBeCloseTo(21)
    expect(index.values[3]).toBeCloseTo(5)
    expect(index.from).toBeNull()
  })

  it('rebases when the first visible day moves', () => {
    const [stock, index] = compareLines({ ...main, bars: nvda.slice(1) }, [{ key: 'sp500', label: 'S&P 500', bars: spy }])
    expect(stock.values[0]).toBe(0)
    expect(stock.values[1]).toBeCloseTo(10)
    expect(index.values[0]).toBe(0)
    expect(index.values[2]).toBeCloseTo((525 / 505 - 1) * 100)
  })

  it('starts a late listing at its own 0% and marks its first date', () => {
    const late = [bar('2026-06-03', 50), bar('2026-06-04', 55)]
    const [, line] = compareLines(main, [{ key: 'AMD', label: 'AMD', bars: late }])
    expect(line.values).toEqual([null, null, 0, expect.closeTo(10)])
    expect(line.from).toBe('2026-06-03')
  })

  it('leaves a missing day as a gap, not a zero', () => {
    const gappy = [bar('2026-06-01', 10), bar('2026-06-03', 12), bar('2026-06-04', 11)]
    const [, line] = compareLines(main, [{ key: 'X', label: 'X', bars: gappy }])
    expect(line.values[1]).toBeNull()
    expect(line.values[2]).toBeCloseTo(20)
  })

  it('bases a line with no bar on the first visible day on its last earlier close', () => {
    const before = [bar('2026-05-29', 20), bar('2026-06-02', 22)]
    const [, line] = compareLines(main, [{ key: 'Y', label: 'Y', bars: before }])
    expect(line.values[0]).toBeNull()
    expect(line.values[1]).toBeCloseTo(10)
    expect(line.from).toBeNull()
  })
})

describe('valueAt', () => {
  const line = { values: [0, 5, null, 8, null] }

  it('reads the hovered day', () => {
    expect(valueAt(line, 1)).toBe(5)
  })

  it('falls back to the last visible day when nothing is hovered', () => {
    expect(valueAt(line, null)).toBe(8)
  })

  it('reads nothing on a hovered day the line did not trade', () => {
    expect(valueAt(line, 2)).toBeNull()
  })
})

describe('pricesFor', () => {
  it('maps percentages onto the main stock price scale', () => {
    expect(pricesFor([0, 10, null, -50], 200)).toEqual([200, expect.closeTo(220), null, 100])
  })
})

describe('compareTicks', () => {
  it('places round percentages inside the price range', () => {
    const ticks = compareTicks(95, 125, 100)
    expect(ticks.map((tick) => Math.round((tick / 100 - 1) * 100))).toEqual([-5, 0, 5, 10, 15, 20, 25])
  })
})

describe('factSentence', () => {
  const lines = [
    { key: 'main', label: 'NVDA', values: [0, 21.4] },
    { key: 'sp500', label: 'S&P 500', values: [0, 6.1] },
    { key: 'XLK', label: 'XLK', values: [0, -2] },
    { key: 'AMD', label: 'AMD', values: [null, 14], from: '2026-07-21' },
  ]

  it('states where each line ended, without judgement', () => {
    expect(factSentence(lines)).toBe(
      'Over this window NVDA rose 21.4%, the S&P 500 rose 6.1%, XLK fell 2.0% and AMD rose 14.0% (from 21 Jul).',
    )
  })

  it('lists only the visible lines', () => {
    expect(factSentence(lines, new Set(['XLK', 'AMD']))).toBe('Over this window NVDA rose 21.4% and the S&P 500 rose 6.1%.')
  })

  it('says a line was flat', () => {
    expect(factSentence([{ key: 'main', label: 'NVDA', values: [0, 0] }])).toBe('Over this window NVDA was flat.')
  })

  it('is empty without any value', () => {
    expect(factSentence([{ key: 'main', label: 'NVDA', values: [] }])).toBe('')
  })
})

describe('compareSuggestions', () => {
  const sectors = [
    { sector: 'Information Technology', fund: { ticker: 'XLK', uic: 35417, asset_type: 'Etf' }, stocks: [{ ticker: 'NVDA' }] },
    { sector: 'Energy', fund: { ticker: 'XLE', uic: 35415, asset_type: 'Etf' }, stocks: [{ ticker: 'XOM' }] },
  ]
  const nvda = { symbol: 'NVDA', uic: 1, assetType: 'Stock' }

  it('offers the S&P 500 and the stock Sector Fund named by its ticker', () => {
    const offered = compareSuggestions(nvda, sectors)
    expect(offered.map((entry) => [entry.key, entry.label])).toEqual([['sp500', 'S&P 500'], ['sector', 'XLK']])
    expect(offered[1].instrument).toEqual({ symbol: 'XLK', uic: 35417, assetType: 'Etf' })
    expect(offered[1].title).toMatch(/weighted by company size/)
  })

  it('does not offer the S&P 500 for SPY itself', () => {
    expect(compareSuggestions({ symbol: 'SPY', uic: SP500.uic, assetType: 'Etf' }, sectors).map((entry) => entry.key)).toEqual([])
  })

  it('does not offer a Sector Fund for a stock without a Sector or for a fund', () => {
    expect(compareSuggestions({ symbol: 'ASML', uic: 9, assetType: 'Stock' }, sectors).map((entry) => entry.key)).toEqual(['sp500'])
    expect(compareSuggestions({ symbol: 'XLK', uic: 35417, assetType: 'Etf' }, sectors).map((entry) => entry.key)).toEqual(['sp500'])
  })

  it('offers only the S&P 500 while the Sectors are unknown', () => {
    expect(compareSuggestions(nvda, undefined).map((entry) => entry.key)).toEqual(['sp500'])
  })
})
