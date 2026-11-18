import { fmtEur, fmtMoney } from './format'
import { rollingHigh, volumeGaps } from './indicators'
import { actionLabel, actionTone } from './verdicts'

const QUALITY_WORDS = { strong: 'Strong company', mixed: 'Mixed company', weak: 'Weak company', unknown: 'Not enough figures on the company' }
const ZONE_WORDS = { cheap: 'cheap price', fair: 'fair price', expensive: 'expensive price' }
const NOT_JUDGED = 'Too little P/E history to judge the price.'

export function stepAt(line, date) {
  if (!line?.length) return null
  let found = null
  for (const step of line) {
    if (step.from <= date) found = step
    else break
  }
  return found
}

export function bandAt(step, band) {
  if (!band || !(step?.eps_ttm > 0)) return null
  return { cheap: step.eps_ttm * band.low, expensive: step.eps_ttm * band.high }
}

export function readPrice(close, levels) {
  if (close == null || !levels) return null
  if (close <= levels.cheap) return 'cheap'
  return close >= levels.expensive ? 'expensive' : 'fair'
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

function priceSentence(verdict, currency) {
  const { cheap_below: cheap, expensive_above: expensive, pe_p25: low, pe_p75: high } = verdict
  if (verdict.valuation === 'not_judged' || cheap == null || expensive == null || low == null || high == null) return NOT_JUDGED
  return `Cheap below ${fmtMoney(cheap, currency)} (P/E ${Math.round(low)}), expensive above ${fmtMoney(expensive, currency)} (P/E ${Math.round(high)}).`
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

export function entrySentence({ verdict, plan, held = false, earnings = null, currency = plan?.currency ?? 'USD' }) {
  const risk = riskLine(plan, held)
  if (!verdict) return risk || earnings ? { word: null, tone: undefined, why: null, next: null, risk, earnings } : null
  const quality = QUALITY_WORDS[verdict.quality] ?? QUALITY_WORDS.unknown
  const valuation = ZONE_WORDS[verdict.valuation]
  return {
    word: actionLabel(verdict).toUpperCase(),
    tone: actionTone(verdict.action),
    why: `${quality}, ${valuation ?? 'no valuation yet'}.`,
    next: priceSentence(verdict, currency),
    risk,
    earnings,
  }
}
