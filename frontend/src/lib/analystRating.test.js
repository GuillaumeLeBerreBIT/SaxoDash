import { describe, expect, it } from 'vitest'

import { analystRating } from './analystRating'

describe('analystRating', () => {
  it('weights the five counts into a mean and a label', () => {
    const rating = analystRating({ period: '2026-09-01', strong_buy: 16, buy: 34, hold: 3, sell: 2, strong_sell: 0 })

    expect(rating.total).toBe(55)
    expect(rating.mean).toBeCloseTo(4.1636, 3)
    expect(rating.fraction).toBeCloseTo(0.7909, 3)
    expect(rating.label).toBe('Buy')
    expect(rating.period).toBe('2026-09-01')
    expect(rating.counts.map((row) => [row.label, row.count])).toEqual([
      ['Strong sell', 0],
      ['Sell', 2],
      ['Hold', 3],
      ['Buy', 34],
      ['Strong buy', 16],
    ])
  })

  it('reads a missing count as none', () => {
    const rating = analystRating({ period: '2026-09-01', hold: 4 })
    expect(rating.total).toBe(4)
    expect(rating.label).toBe('Hold')
    expect(rating.fraction).toBe(0.5)
  })

  it('answers null without a recommendation or without analysts', () => {
    expect(analystRating(null)).toBeNull()
    expect(analystRating(undefined)).toBeNull()
    expect(analystRating({ period: '2026-09-01', strong_buy: 0, buy: 0, hold: 0, sell: 0, strong_sell: 0 })).toBeNull()
  })

  it('labels the extremes', () => {
    expect(analystRating({ strong_buy: 9, buy: 1 }).label).toBe('Strong buy')
    expect(analystRating({ strong_sell: 9, sell: 1 }).label).toBe('Strong sell')
  })
})
