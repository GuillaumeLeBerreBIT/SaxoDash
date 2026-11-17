import { fmtEur, fmtMoney } from './format'
import { actionLabel, actionTone } from './verdicts'

export const FAIR_BAND = 0.1

const QUALITY_WORDS = { strong: 'Strong company', mixed: 'Mixed company', weak: 'Weak company', unknown: 'Not enough figures on the company' }
const ZONE_WORDS = { cheap: 'cheap price', fair: 'fair price', expensive: 'expensive price' }
const NO_LINE = 'Too little earnings history for a growth line.'

export function stepAt(line, date) {
  if (!line?.length) return null
  let found = null
  for (const step of line) {
    if (step.from <= date) found = step
    else break
  }
  return found
}

export function readPrice(close, step) {
  if (close == null || !step) return null
  const ratio = close / step.price - 1
  if (ratio < -FAIR_BAND) return 'cheap'
  if (step.capped) return 'priced_in'
  return ratio > FAIR_BAND ? 'expensive' : 'fair'
}

export function peChip(verdict) {
  if (!verdict || verdict.valuation === 'not_judged') return null
  const { current_pe: pe, pe_p25: low, pe_p75: high } = verdict
  if (pe == null || low == null || high == null) return null
  return { pe, low, high, position: pe < low ? 'below' : pe > high ? 'above' : 'inside' }
}

const signedPercent = (value) => {
  const rounded = Math.round(value)
  if (rounded === 0) return '+0%'
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded)}%`
}

export function growthSentence(step, close, currency) {
  const growth = Math.round(step.growth)
  const level = fmtMoney(step.price, currency)
  const gap = signedPercent((close / step.price - 1) * 100)
  const reading = readPrice(close, step)
  if (step.capped) {
    const ending = reading === 'cheap' ? `price is ${gap} below it, so cheap even on that floor` : `price is ${gap} above it, so its growth is priced in`
    return `Against its growth: earnings grew ${growth}% a year, more than a P/E of ${step.pe} assumes. At P/E ${step.pe} that is about ${level}; ${ending}.`
  }
  return `Against its growth: earnings grew ${growth}% a year over three years, which supports a P/E of ${step.pe}, about ${level}. Price is ${gap} from that line, so ${reading}.`
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
