import { describe, expect, it } from 'vitest'

import { technicalRating } from './technicalRating'

const series = (length, closeAt) =>
  Array.from({ length }, (_, i) => ({ date: `d${i}`, open: closeAt(i), high: closeAt(i), low: closeAt(i), close: closeAt(i), volume: 1 }))

describe('technicalRating', () => {
  it('reads a steady climb as price above every average', () => {
    const rating = technicalRating(series(260, (i) => 100 + i))
    const votes = Object.fromEntries(rating.votes.map((vote) => [vote.key, vote.vote]))

    expect(votes.sma20).toBe('buy')
    expect(votes.sma50).toBe('buy')
    expect(votes.sma200).toBe('buy')
    expect(votes.ema9).toBe('buy')
    expect(votes.rsi).toBe('sell')
    expect(rating.buy + rating.neutral + rating.sell).toBe(rating.votes.length)
  })

  it('reads a steady decline as price below every average and RSI oversold', () => {
    const rating = technicalRating(series(260, (i) => 400 - i))
    const votes = Object.fromEntries(rating.votes.map((vote) => [vote.key, vote.vote]))

    expect(votes.sma200).toBe('sell')
    expect(votes.rsi).toBe('buy')
    expect(rating.score).toBeLessThan(0)
  })

  it('skips an indicator that has no value yet instead of counting it', () => {
    const rating = technicalRating(series(60, (i) => 100 + i))
    expect(rating.votes.map((vote) => vote.key)).not.toContain('sma200')
    expect(rating.votes.map((vote) => vote.key)).toContain('sma50')
  })

  it('answers null when nothing can vote', () => {
    expect(technicalRating([])).toBeNull()
    expect(technicalRating(series(3, () => 10))).toBeNull()
  })

  it('votes buy on MACD for an accelerating rise', () => {
    const rating = technicalRating(series(260, (i) => 100 + i * i * 0.01))
    expect(rating.votes.find((vote) => vote.key === 'macd').vote).toBe('buy')
  })

  it('votes sell on MACD for an accelerating decline that stays positive', () => {
    const rating = technicalRating(series(260, (i) => 700 - i * i * 0.01))
    expect(rating.votes.find((vote) => vote.key === 'macd').vote).toBe('sell')
  })

  it('maps the score onto a 0 to 1 fraction', () => {
    const rating = technicalRating(series(260, (i) => 100 + i))
    expect(rating.fraction).toBeCloseTo((rating.score + 1) / 2, 10)
  })

  it('labels five buys against one sell, a score of 2/3, as Strong buy', () => {
    const rating = technicalRating(series(260, (i) => 100 + i))
    expect([rating.buy, rating.neutral, rating.sell]).toEqual([5, 0, 1])
    expect(rating.fraction).toBeCloseTo(5 / 6, 10)
    expect(rating.label).toBe('Strong buy')
  })

  it('labels four buys against two sells, a score of 1/3, as Buy', () => {
    const rating = technicalRating(series(260, (i) => (i < 240 ? 400 - i : 160 + (i - 240) * 3)))
    expect([rating.buy, rating.neutral, rating.sell]).toEqual([4, 0, 2])
    expect(rating.fraction).toBeCloseTo(2 / 3, 10)
    expect(rating.label).toBe('Buy')
  })

  it('labels two buys against four sells as Sell', () => {
    const rating = technicalRating(series(260, (i) => (i < 240 ? 100 + i : 340 - (i - 240) * 3)))
    expect([rating.buy, rating.neutral, rating.sell]).toEqual([2, 0, 4])
    expect(rating.fraction).toBeCloseTo(1 / 3, 10)
    expect(rating.label).toBe('Sell')
  })

  it('labels two buys, one neutral and three sells as Neutral', () => {
    const rating = technicalRating(series(260, (i) => (i < 255 ? 100 + i : 355 - (i - 254) * 2)))
    expect([rating.buy, rating.neutral, rating.sell]).toEqual([2, 1, 3])
    expect(rating.fraction).toBeCloseTo(5 / 12, 10)
    expect(rating.label).toBe('Neutral')
  })

  it('labels one buy against five sells as Strong sell', () => {
    const rating = technicalRating(series(260, (i) => 400 - i))
    expect([rating.buy, rating.neutral, rating.sell]).toEqual([1, 0, 5])
    expect(rating.label).toBe('Strong sell')
  })
})
