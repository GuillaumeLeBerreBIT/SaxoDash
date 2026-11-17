import { describe, expect, it } from 'vitest'

import { dayChange, tradeMarkers } from './portfolioHero'

const quotes = (entries) => new Map(entries)

describe('dayChange', () => {
  it('turns each holding move into euros and sums them', () => {
    const positions = [
      { uic: 1, value: '110' },
      { uic: 2, value: '90' },
    ]
    const change = dayChange(positions, quotes([[1, { change_pct: 10 }], [2, { change_pct: -10 }]]))
    expect(change.amount).toBeCloseTo(0)
    expect(change.pct).toBeCloseTo(0)
  })

  it('gives the percentage against yesterday\'s value', () => {
    const change = dayChange([{ uic: 1, value: '110' }], quotes([[1, { change_pct: 10 }]]))
    expect(change.amount).toBeCloseTo(10)
    expect(change.pct).toBeCloseTo(10)
  })

  it('is null when no holding has a quote yet', () => {
    expect(dayChange([{ uic: 1, value: '110' }], quotes([]))).toBeNull()
    expect(dayChange([], quotes([]))).toBeNull()
  })

  it('counts only the holdings that have a move', () => {
    const change = dayChange(
      [
        { uic: 1, value: '110' },
        { uic: 2, value: '500' },
      ],
      quotes([[1, { change_pct: 10 }], [2, { change_pct: null }]]),
    )
    expect(change.amount).toBeCloseTo(10)
    expect(change.covered).toBe(1)
  })
})

describe('tradeMarkers', () => {
  const history = [
    { date: '2026-09-01', portfolio_value: '100' },
    { date: '2026-09-02', portfolio_value: '120' },
    { date: '2026-09-03', portfolio_value: '90' },
  ]

  it('puts one marker per day and kind on the value line', () => {
    const markers = tradeMarkers(history, [
      { date: '2026-09-02', type: 'BUY', ticker: 'META' },
      { date: '2026-09-02', type: 'BUY', ticker: 'NBIS' },
      { date: '2026-09-03', type: 'SELL', ticker: 'VST' },
      { date: '2026-09-03', type: 'DIVIDEND', ticker: 'AAPL' },
    ])
    expect(markers).toEqual([
      { date: '2026-09-02', kind: 'buy', value: 120, tickers: ['META', 'NBIS'] },
      { date: '2026-09-03', kind: 'sell', value: 90, tickers: ['VST'] },
    ])
  })

  it('leaves out trades outside the chart range', () => {
    expect(tradeMarkers(history, [{ date: '2026-08-01', type: 'BUY', ticker: 'X' }])).toEqual([])
  })

  it('reads timestamps as their day', () => {
    const markers = tradeMarkers(history, [{ date: '2026-09-01T14:30:00Z', type: 'BUY', ticker: 'X' }])
    expect(markers[0].date).toBe('2026-09-01')
  })

  it('is empty without history or trades', () => {
    expect(tradeMarkers([], [{ date: '2026-09-01', type: 'BUY', ticker: 'X' }])).toEqual([])
    expect(tradeMarkers(history, undefined)).toEqual([])
  })
})
