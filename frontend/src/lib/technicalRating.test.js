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

describe('technicalRating values and readings', () => {
  const byKey = (rating) => Object.fromEntries(rating.votes.map((vote) => [vote.key, vote]))

  it('gives every vote a finite value and a reading on a steady climb', () => {
    const votes = byKey(technicalRating(series(260, (i) => 100 + i)))

    for (const vote of Object.values(votes)) {
      expect(Number.isFinite(vote.value)).toBe(true)
      expect(typeof vote.reading).toBe('string')
    }
    expect(votes.rsi.reading).toBe('Overbought')
    expect(votes.macd.reading).toBe('Above signal')
    expect(votes.macd.value).toBeGreaterThan(0)
    for (const key of ['ema9', 'sma20', 'sma50', 'sma200']) expect(votes[key].reading).toBe('Price above')
    expect(votes.sma20.value).toBeCloseTo(359 - 9.5, 6)
  })

  it('reads an RSI above 70 as Overbought with a sell vote', () => {
    const rsi = byKey(technicalRating(series(260, (i) => 100 + i))).rsi

    expect(rsi.value).toBeGreaterThan(70)
    expect(rsi.reading).toBe('Overbought')
    expect(rsi.vote).toBe('sell')
  })

  it('reads a steady decline as Oversold, Below signal and Price below', () => {
    const votes = byKey(technicalRating(series(260, (i) => 400 - i)))

    expect(votes.rsi.reading).toBe('Oversold')
    expect(votes.rsi.vote).toBe('buy')
    expect(votes.macd.reading).toBe('Below signal')
    expect(votes.macd.value).toBeLessThan(0)
    expect(votes.sma200.reading).toBe('Price below')
  })

  it('reads a mid-range RSI as Mid-range', () => {
    const rsi = byKey(technicalRating(series(260, (i) => 100 + (i % 2)))).rsi

    expect(rsi.value).toBeGreaterThanOrEqual(30)
    expect(rsi.value).toBeLessThanOrEqual(70)
    expect(rsi.reading).toBe('Mid-range')
  })

  it('reads price equal to an average as Price at and MACD equal to its signal as On signal', () => {
    const votes = byKey(technicalRating(series(260, () => 50)))

    expect(votes.sma20.reading).toBe('Price at')
    expect(votes.sma20.value).toBe(50)
    expect(votes.macd.reading).toBe('On signal')
    expect(votes.macd.value).toBe(0)
  })

  it('has no sma50 or sma200 vote with only 30 bars', () => {
    const keys = technicalRating(series(30, (i) => 100 + i)).votes.map((vote) => vote.key)

    expect(keys).not.toContain('sma50')
    expect(keys).not.toContain('sma200')
    expect(keys).toContain('sma20')
  })

  it('keeps the key, label and vote of every entry', () => {
    const rating = technicalRating(series(260, (i) => 100 + i))

    expect(rating.votes.map(({ key, label, vote }) => ({ key, label, vote }))).toEqual([
      { key: 'rsi', label: 'RSI (14)', vote: 'sell' },
      { key: 'macd', label: 'MACD (12, 26)', vote: 'buy' },
      { key: 'ema9', label: 'EMA 9', vote: 'buy' },
      { key: 'sma20', label: 'SMA 20', vote: 'buy' },
      { key: 'sma50', label: 'SMA 50', vote: 'buy' },
      { key: 'sma200', label: 'SMA 200', vote: 'buy' },
    ])
  })
})
