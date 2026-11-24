import { fmtEur, fmtMoney } from './format'
import { rollingHigh, volumeGaps } from './indicators'
import { actionLabel, actionTone } from './verdicts'

const QUALITY_WORDS = { strong: 'Strong company', incomplete: 'Incomplete figures on the company', mixed: 'Mixed company', weak: 'Weak company', unknown: 'Not enough figures on the company' }
const ZONE_WORDS = { cheap: 'P/E below its usual range', fair: 'P/E within its usual range', expensive: 'P/E above its usual range' }
const NOT_JUDGED = 'Too little P/E history to judge the price.'

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

function priceSentence(verdict, currency) {
  const { cheap_below: cheap, expensive_above: expensive, pe_p25: low, pe_p75: high } = verdict
  if (verdict.valuation === 'not_judged' || cheap == null || expensive == null || low == null || high == null) return NOT_JUDGED
  return `Its usual P/E of ${Math.round(low)} to ${Math.round(high)} spans ${fmtMoney(cheap, currency)} to ${fmtMoney(expensive, currency)}. A rule of thumb, not a buy signal.`
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
