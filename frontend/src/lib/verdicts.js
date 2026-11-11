import { ownershipTicker } from './ownership'

export const ACTION_LABEL = {
  buy: 'Buy',
  add: 'Add',
  hold: 'Hold',
  trim: 'Trim',
  sell_review: 'Sell (review)',
  wait: 'Wait',
  not_a_fit: 'Not a fit',
  no_verdict: 'No verdict',
}

export const GRADE_LABEL = {
  quality: { strong: 'Strong', mixed: 'Mixed', weak: 'Weak', unknown: 'Not enough data' },
  valuation: { cheap: 'Cheap', fair: 'Fair', expensive: 'Expensive', not_judged: 'Not judged' },
}

export const CHECK_STATUS_LABEL = { pass: 'Pass', fail: 'Fail', unknown: 'Unknown' }

const PERCENT_CHECKS = new Set(['roe', 'roic', 'margins', 'earnings_growth', 'revenue_growth'])

const TONE = { buy: 'up', add: 'up', trim: 'warn', sell_review: 'warn' }

export const actionTone = (action) => TONE[action]

const oneDecimal = (value) => Number(Number(value).toFixed(1))

export function checkLine({ key, label, value, threshold }) {
  if (value == null) return `${label} · no figure`
  const unit = PERCENT_CHECKS.has(key) ? '%' : ''
  return `${label} ${oneDecimal(value)}${unit} · needs ${threshold}`
}

export function trendSentence(pctVsMa200) {
  if (pctVsMa200 == null) return null
  const side = pctVsMa200 < 0 ? 'under' : 'above'
  return `${oneDecimal(Math.abs(pctVsMa200))}% ${side} its 200-day average`
}

export const verdictTicker = (instrument) => ownershipTicker(instrument)

export const US_LISTING_SUFFIXES = new Set(['xnas', 'xnys', 'xase'])

const positionVerdictTicker = (position) => (position.type === 'ETF' ? null : verdictTicker(position))

export function watchlistVerdictTicker(item) {
  if (item.asset_type !== 'Stock') return null
  const [ticker, suffix] = item.symbol.split(':')
  if (!US_LISTING_SUFFIXES.has((suffix ?? '').toLowerCase())) return null
  return verdictTicker({ ticker })
}

export function positionVerdictTickers(positions = []) {
  return [...new Set(positions.map(positionVerdictTicker).filter(Boolean))].sort()
}

function lookUpVerdict(ticker, verdicts) {
  if (!ticker) return null
  if (!verdicts) return undefined
  return verdicts[ticker] ?? null
}

export const positionVerdict = (position, verdicts) => lookUpVerdict(positionVerdictTicker(position), verdicts)

export const watchlistVerdict = (item, verdicts) => lookUpVerdict(watchlistVerdictTicker(item), verdicts)
