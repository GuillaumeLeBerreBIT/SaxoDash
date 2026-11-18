import { ownershipTicker } from './ownership'

export const ACTION_LABEL = {
  buy: 'Passes quality screen',
  add: 'Passes quality screen',
  hold: 'Hold',
  trim: 'Trim',
  sell_review: 'Review',
  not_a_fit: 'Not a fit',
  no_verdict: 'No verdict',
}

export function actionLabel(verdict) {
  return ACTION_LABEL[verdict.action] ?? verdict.action
}

export const GRADE_LABEL = {
  quality: { strong: 'Strong', mixed: 'Mixed', weak: 'Weak', unknown: 'Not enough data' },
  valuation: { cheap: 'Below usual P/E', fair: 'Within usual P/E', expensive: 'Above usual P/E', not_judged: 'Not judged' },
}

export const CHECK_STATUS_LABEL = { pass: 'Pass', fail: 'Fail', unknown: 'Unknown' }

const PERCENT_CHECKS = new Set(['roe', 'roic', 'margins', 'earnings_growth', 'revenue_growth', 'cash'])

const TONE = { trim: 'warn', sell_review: 'warn' }

export const actionTone = (action) => TONE[action]

const oneDecimal = (value) => Number(Number(value).toFixed(1))

const CHECK_BASIS = {
  roe: ' in a typical year',
  roic: ' in a typical year',
  margins: ' in a typical year',
  earnings_growth: ' a year over 5 years',
  revenue_growth: ' a year over 5 years',
  debt: ' × equity, latest quarter',
  cash: ' of profit, in a typical year',
}

export const CHECK_BASIS_NOTE =
  'Quality looks at the middle of the last five fiscal years and at five-year growth, so these figures can differ from the last-twelve-month ones in the snapshot.'

export function checkLine({ key, label, value, threshold }) {
  if (value == null) return `${label} · no figure`
  const unit = PERCENT_CHECKS.has(key) ? '%' : ''
  return `${label} ${oneDecimal(value)}${unit}${CHECK_BASIS[key] ?? ''} · needs ${threshold}`
}

export function trendSentence(pctVsMa200) {
  if (pctVsMa200 == null) return null
  const side = pctVsMa200 < 0 ? 'under' : 'above'
  return `${oneDecimal(Math.abs(pctVsMa200))}% ${side} its 200-day average`
}

export const verdictTicker = (instrument) => ownershipTicker(instrument)

const positionVerdictTicker = (position) => (position.type === 'ETF' ? null : verdictTicker(position))

export function watchlistVerdictTicker(item) {
  if (item.asset_type !== 'Stock') return null
  return verdictTicker({ ticker: item.symbol.split(':')[0] })
}

export function positionVerdictTickers(positions = []) {
  return [...new Set(positions.map(positionVerdictTicker).filter(Boolean))].sort()
}

const sameListing = (verdict, uic) => uic == null || (verdict.uic != null && Number(verdict.uic) === Number(uic))

function lookUpVerdict(ticker, uic, verdicts) {
  if (!ticker) return null
  if (!verdicts) return undefined
  const verdict = verdicts[ticker]
  return verdict && sameListing(verdict, uic) ? verdict : null
}

export const positionVerdict = (position, verdicts) =>
  lookUpVerdict(positionVerdictTicker(position), position.uic, verdicts)

export const watchlistVerdict = (item, verdicts) =>
  lookUpVerdict(watchlistVerdictTicker(item), item.uic, verdicts)
