import { ema, macd, rsi, sma } from './indicators'

const RSI_OVERSOLD = 30
const RSI_OVERBOUGHT = 70
const STRONG = 0.5
const MILD = 0.1

const last = (series) => series[series.length - 1]

function against(value, reference) {
  if (value > reference) return 'buy'
  if (value < reference) return 'sell'
  return 'neutral'
}

function rsiVote(value) {
  if (value < RSI_OVERSOLD) return 'buy'
  if (value > RSI_OVERBOUGHT) return 'sell'
  return 'neutral'
}

export function ratingLabel(score) {
  if (score > STRONG) return 'Strong buy'
  if (score > MILD) return 'Buy'
  if (score < -STRONG) return 'Strong sell'
  if (score < -MILD) return 'Sell'
  return 'Neutral'
}

export function technicalRating(bars) {
  if (!bars.length) return null
  const closes = bars.map((bar) => bar.close)
  const price = last(closes)
  const macdSeries = macd(closes)
  const macdLine = last(macdSeries.line)
  const macdSignal = last(macdSeries.signal)
  const rsiValue = last(rsi(closes))

  const candidates = [
    ['rsi', 'RSI (14)', rsiValue == null ? null : rsiVote(rsiValue)],
    ['macd', 'MACD (12, 26)', macdLine == null || macdSignal == null ? null : against(macdLine, macdSignal)],
    ...[
      ['ema9', 'EMA 9', last(ema(closes, 9))],
      ['sma20', 'SMA 20', last(sma(closes, 20))],
      ['sma50', 'SMA 50', last(sma(closes, 50))],
      ['sma200', 'SMA 200', last(sma(closes, 200))],
    ].map(([key, label, average]) => [key, label, average == null ? null : against(price, average)]),
  ]

  const votes = candidates.filter(([, , vote]) => vote != null).map(([key, label, vote]) => ({ key, label, vote }))
  if (!votes.length) return null

  const count = (kind) => votes.filter((vote) => vote.vote === kind).length
  const buy = count('buy')
  const sell = count('sell')
  const score = (buy - sell) / votes.length

  return { votes, buy, neutral: count('neutral'), sell, score, fraction: (score + 1) / 2, label: ratingLabel(score) }
}
