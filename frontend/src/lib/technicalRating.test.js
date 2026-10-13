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
})
