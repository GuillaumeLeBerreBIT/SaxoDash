import { ema, macd, rsi, sma } from './indicators'
import { ratingBand } from './ratingBand'

const RSI_OVERSOLD = 30
const RSI_OVERBOUGHT = 70
const LABELS = ['Strong sell', 'Sell', 'Neutral', 'Buy', 'Strong buy']

const last = (series) => series[series.length - 1]

function against(value, reference) {
  if (value > reference) return 'buy'
  if (value < reference) return 'sell'
  return 'neutral'
}

function rsiReading(value) {
  if (value < RSI_OVERSOLD) return 'Oversold'
  if (value > RSI_OVERBOUGHT) return 'Overbought'
  return 'Mid-range'
}

const MACD_READINGS = { buy: 'Above signal', sell: 'Below signal', neutral: 'On signal' }
const AVERAGE_READINGS = { buy: 'Price above', sell: 'Price below', neutral: 'Price at' }

function rsiVote(value) {
  if (value < RSI_OVERSOLD) return 'buy'
  if (value > RSI_OVERBOUGHT) return 'sell'
  return 'neutral'
}

export function technicalRating(bars) {
  if (!bars.length) return null
  const closes = bars.map((bar) => bar.close)
  const price = last(closes)
  const macdSeries = macd(closes)
  const macdLine = last(macdSeries.line)
  const macdSignal = last(macdSeries.signal)
  const rsiValue = last(rsi(closes))

  const average = (key, label, value) =>
    value == null ? null : { key, label, vote: against(price, value), value, reading: AVERAGE_READINGS[against(price, value)] }

  const candidates = [
    rsiValue == null ? null : { key: 'rsi', label: 'RSI (14)', vote: rsiVote(rsiValue), value: rsiValue, reading: rsiReading(rsiValue) },
    macdLine == null || macdSignal == null
      ? null
      : {
          key: 'macd',
          label: 'MACD (12, 26)',
          vote: against(macdLine, macdSignal),
          value: macdLine - macdSignal,
          reading: MACD_READINGS[against(macdLine, macdSignal)],
        },
    average('ema9', 'EMA 9', last(ema(closes, 9))),
    average('sma20', 'SMA 20', last(sma(closes, 20))),
    average('sma50', 'SMA 50', last(sma(closes, 50))),
    average('sma200', 'SMA 200', last(sma(closes, 200))),
  ]

  const votes = candidates.filter(Boolean)
  if (!votes.length) return null

  const count = (kind) => votes.filter((vote) => vote.vote === kind).length
  const buy = count('buy')
  const sell = count('sell')
  const score = (buy - sell) / votes.length

  const fraction = (score + 1) / 2

  return { votes, buy, neutral: count('neutral'), sell, score, fraction, label: LABELS[ratingBand(fraction)] }
}
