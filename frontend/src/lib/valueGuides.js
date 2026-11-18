import { fmtEur, fmtMoney } from './format'
import { rollingHigh, volumeGaps } from './indicators'
import { actionLabel, actionTone } from './verdicts'

export const FAIR_BAND = 0.1

const QUALITY_WORDS = { strong: 'Strong company', mixed: 'Mixed company', weak: 'Weak company', unknown: 'Not enough figures on the company' }
const ZONE_WORDS = { cheap: 'cheap price', fair: 'fair price', expensive: 'expensive price' }
const NO_LINE = 'Too little earnings history for a growth line.'
const LINE_ENDED = 'No growth line while trailing earnings are not positive.'
const BAND_EDGE = FAIR_BAND * 100

export function stepAt(line, date) {
  if (!line?.length) return null
  let found = null
  for (const step of line) {
    if (step.from <= date) found = step
    else break
  }
  return found
}

function bandSide(close, price) {
  if (close < price * (1 - FAIR_BAND)) return -1
  return close > price * (1 + FAIR_BAND) ? 1 : 0
}

export function readPrice(close, step) {
  if (close == null || step?.price == null) return null
  const side = bandSide(close, step.price)
  if (side < 0) return 'cheap'
  if (step.capped) return 'priced_in'
  return side > 0 ? 'expensive' : 'fair'
}

export function guideSeries(bars, { high, gaps }) {
  return {
    highs: high ? rollingHigh(bars) : null,
    gaps: gaps ? volumeGaps(bars).map((gap) => ({ ...gap, filledOn: gap.filled ? bars[gap.end].date : null })) : [],
  }
}

export function visibleGuides(series, bars, data) {
  const offset = data.length ? bars.findIndex((bar) => bar.date === data[0].date) : -1
  if (offset < 0) return { highs: null, gaps: [] }
  return {
    highs: series.highs ? series.highs.slice(offset, offset + data.length) : null,
    gaps: series.gaps
      .map((gap) => ({ ...gap, index: gap.index - offset, end: gap.end - offset }))
      .filter((gap) => gap.end >= 0 && gap.index < data.length),
  }
}

export function peChip(verdict) {
  if (!verdict || verdict.valuation === 'not_judged') return null
  const { current_pe: pe, pe_p25: low, pe_p75: high } = verdict
  if (pe == null || low == null || high == null) return null
  return { pe, low, high, position: pe <= low ? 'below' : pe >= high ? 'above' : 'inside' }
}

export function usualPe(chip) {
  return chip ? Math.round((chip.low + chip.high) / 2) : null
}

export function usualPrice(step, pe) {
  return pe && step?.eps_ttm > 0 ? step.eps_ttm * pe : null
}

function distance(change, side) {
  const whole = Math.round(Math.abs(change))
  if (whole !== BAND_EDGE) return String(whole)
  const tenth = Math.round(Math.abs(change) * 10) / 10
  return (side === 0 ? Math.min(tenth, BAND_EDGE) : Math.max(tenth, BAND_EDGE + 0.1)).toFixed(1)
}

const signedPercent = (change, side) => {
  const shown = distance(change, side)
  return `${Number(shown) !== 0 && change < 0 ? '−' : '+'}${shown}%`
}

export function growthSentence(step, close, currency) {
  if (step.price == null) return LINE_ENDED
  const growth = Math.round(step.growth)
  const pe = Math.round(step.pe)
  const level = fmtMoney(step.price, currency)
  const known = Number.isFinite(close)
  const change = known ? (close / step.price - 1) * 100 : 0
  const side = known ? bandSide(close, step.price) : 0
  const reading = readPrice(known ? close : null, step)
  if (step.capped) {
    const lead = `Against its growth: earnings grew ${growth}% a year, more than a P/E of ${pe} assumes. At P/E ${pe} that is about ${level}`
    if (!known) return `${lead}.`
    const where = Math.round(change) < 0 ? 'below' : 'above'
    const ending = reading === 'cheap' ? 'so cheap even on that floor' : 'so its growth is priced in'
    return `${lead}; price is ${distance(change, side)}% ${where} it, ${ending}.`
  }
  const lead = `Against its growth: earnings grew ${growth}% a year over three years, which supports a P/E of ${pe}, about ${level}.`
  return known ? `${lead} Price is ${signedPercent(change, side)} from that line, so ${reading}.` : lead
}

const percent = (value) => `${Math.abs(value).toFixed(1)}%`

function againstAverage(plan) {
  if (!plan.avgCost) return ''
  const gap = (plan.stop.price / plan.avgCost - 1) * 100
  return ` and ${percent(gap)} ${gap >= 0 ? 'above' : 'below'} your average price of ${fmtMoney(plan.avgCost, plan.currency)}`
}

function riskLine(plan, held) {
  if (!plan) return null
  const where = `Stop-loss at ${fmtMoney(plan.stop.price, plan.currency)}, ${percent(plan.stopDistancePct)} below today's close${againstAverage(plan)}.`
  if (!(plan.size?.shares > 0)) return where
  const loss = fmtEur(plan.size.lossAtStop, { decimals: 0 })
  return `${where} ${held ? 'Adding' : 'Buying'} ${plan.size.shares} shares today would risk ${loss}.`
}

export function entrySentence({ verdict, price, plan, held = false, earnings = null, currency = plan?.currency ?? 'USD' }) {
  const risk = riskLine(plan, held)
  if (!verdict) return risk || earnings ? { word: null, tone: undefined, why: null, next: null, risk, earnings } : null
  const quality = QUALITY_WORDS[verdict.quality] ?? QUALITY_WORDS.unknown
  const valuation = ZONE_WORDS[verdict.valuation]
  const step = stepAt(verdict.growth_line, new Date().toISOString().slice(0, 10))
  return {
    word: actionLabel(verdict).toUpperCase(),
    tone: actionTone(verdict.action),
    why: `${quality}, ${valuation ?? 'no valuation yet'}.`,
    next: step ? growthSentence(step, price, currency) : NO_LINE,
    risk,
    earnings,
  }
}
