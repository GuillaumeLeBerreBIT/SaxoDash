import { WEIGHT_CAP_PCT } from './portfolioStats'

export const RISK_CHOICES = [0.5, 1, 2]
export const DEFAULT_RISK_PCT = 1
export const STOP_ATRS = 2
export const ATR_PERIOD = 14
export const REPORTING_CURRENCY = 'EUR'

const positive = (value) => {
  const number = Number(value)
  return value != null && Number.isFinite(number) && number > 0 ? number : null
}

export function averageTrueRange(bars, period = ATR_PERIOD) {
  if (!bars || bars.length < period + 1) return null
  const ranges = bars.slice(1).map((bar, index) => {
    const previous = bars[index].close
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previous), Math.abs(bar.low - previous))
  })
  let average = ranges.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  for (const range of ranges.slice(period)) average = (average * (period - 1) + range) / period
  return average
}

export function fxRateFor(currency, positions = []) {
  if (!currency) return null
  if (currency === REPORTING_CURRENCY) return 1
  for (const position of positions) {
    const rate = positive(position.fx_rate)
    if (position.currency === currency && rate) return rate
  }
  return null
}

function stopFor(price, atr, stopPrice) {
  const own = positive(stopPrice)
  if (own && own < price) return { price: own, source: 'yours' }
  const range = positive(atr)
  if (!range || price - STOP_ATRS * range <= 0) return null
  return { price: price - STOP_ATRS * range, source: 'atr' }
}

function sizeFor({ price, riskPerShare, riskPct, portfolioValue, fxRate, heldWeightPct, capPct }) {
  const total = positive(portfolioValue)
  const rate = positive(fxRate)
  if (!total || !rate) return null
  const byRisk = Math.floor((total * riskPct) / 100 / (riskPerShare * rate))
  const room = Math.max(0, capPct - (heldWeightPct ?? 0))
  const byCap = Math.floor((total * room) / 100 / (price * rate))
  const shares = Math.min(byRisk, byCap)
  const value = shares * price * rate
  return {
    shares,
    value,
    weightPct: (value / total) * 100,
    lossAtStop: shares * riskPerShare * rate,
    limitedByCap: byCap < byRisk,
  }
}

export function tradePlan({
  price, atr, stopPrice, targetPrice, riskPct = DEFAULT_RISK_PCT, portfolioValue, fxRate,
  heldWeightPct = 0, capPct = WEIGHT_CAP_PCT,
}) {
  const last = positive(price)
  if (!last) return null
  const stop = stopFor(last, atr, stopPrice)
  if (!stop) return null
  const riskPerShare = last - stop.price
  const target = positive(targetPrice)
  const range = positive(atr)
  return {
    price: last,
    stop,
    riskPerShare,
    stopDistancePct: (-riskPerShare / last) * 100,
    stopAtrs: range ? riskPerShare / range : null,
    target: target && target > last ? target : null,
    rewardToRisk: target && target > last ? (target - last) / riskPerShare : null,
    size: sizeFor({ price: last, riskPerShare, riskPct, portfolioValue, fxRate, heldWeightPct, capPct }),
  }
}

function heldWeight(position, portfolioValue) {
  const value = Number(position?.value)
  const total = Number(portfolioValue)
  return value > 0 && total > 0 ? (value / total) * 100 : 0
}

export function planFromPage({ bars, currency, note, positions, position, portfolioValue, riskPct }) {
  if (!currency || !bars?.length) return null
  const latest = bars[bars.length - 1]
  const plan = tradePlan({
    price: latest.close,
    atr: averageTrueRange(bars),
    stopPrice: note?.stop_price,
    targetPrice: note?.target_price,
    riskPct,
    portfolioValue,
    fxRate: fxRateFor(currency, positions),
    heldWeightPct: heldWeight(position, portfolioValue),
  })
  const avgCost = Number(position?.avg_cost)
  return plan && { ...plan, currency, asOf: latest.date, riskPct, avgCost: avgCost > 0 ? avgCost : null }
}

const RISK_KEY = 'saxodash:trade-risk-pct'
const RISK_EVENT = 'saxodash:trade-risk'

export function readTradeRisk() {
  try {
    const value = Number(window.localStorage.getItem(RISK_KEY))
    return RISK_CHOICES.includes(value) ? value : DEFAULT_RISK_PCT
  } catch {
    return DEFAULT_RISK_PCT
  }
}

export function writeTradeRisk(value) {
  try {
    window.localStorage.setItem(RISK_KEY, String(value))
  } catch {
    return
  } finally {
    window.dispatchEvent(new Event(RISK_EVENT))
  }
}

export function subscribeTradeRisk(notify) {
  window.addEventListener(RISK_EVENT, notify)
  window.addEventListener('storage', notify)
  return () => {
    window.removeEventListener(RISK_EVENT, notify)
    window.removeEventListener('storage', notify)
  }
}
