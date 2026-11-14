import { fmtEur, fmtMoney } from './format'
import { actionLabel, actionTone } from './verdicts'

const QUALITY_WORDS = { strong: 'Strong company', mixed: 'Mixed company', weak: 'Weak company', unknown: 'Not enough figures on the company' }
const ZONE_WORDS = { cheap: 'cheap price', fair: 'fair price', expensive: 'expensive price' }

export function priceZones(verdict) {
  const buyBelow = Number(verdict?.cheap_below)
  const expensiveAbove = Number(verdict?.expensive_above)
  if (!verdict || verdict.valuation === 'not_judged' || !(buyBelow > 0) || !(expensiveAbove > buyBelow)) return null
  return { buyBelow, expensiveAbove, buyable: verdict.quality === 'strong' }
}

export function zoneOf(price, zones) {
  if (!zones || price == null) return null
  if (price < zones.buyBelow) return 'cheap'
  return price > zones.expensiveAbove ? 'expensive' : 'fair'
}

const lower = (price, level) => `${Math.round((1 - level / price) * 100)}% lower`

function nextLine(zones, zone, price, currency) {
  const buy = fmtMoney(zones.buyBelow, currency)
  const expensive = fmtMoney(zones.expensiveAbove, currency)
  if (zone === 'cheap') {
    return zones.buyable
      ? `In the buy zone: cheap for this company below ${buy}. Expensive above ${expensive}.`
      : `Cheap for this company below ${buy}, but it does not pass the quality checks.`
  }
  if (zone === 'expensive') return `Expensive for this company above ${expensive}. Cheap below ${buy} (${lower(price, zones.buyBelow)}).`
  return `Becomes cheap below ${buy} (${lower(price, zones.buyBelow)}). Expensive above ${expensive}.`
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
  const zones = priceZones(verdict)
  const zone = zoneOf(price, zones)
  const quality = QUALITY_WORDS[verdict.quality] ?? QUALITY_WORDS.unknown
  const moved = zone && zone !== verdict.valuation ? ' The verdict updates tonight.' : ''
  return {
    word: actionLabel(verdict).toUpperCase(),
    tone: actionTone(verdict.action),
    why: `${quality}, ${zone ? ZONE_WORDS[zone] : 'no valuation yet'}.`,
    next: zones
      ? `${nextLine(zones, zone, price, currency)}${moved}`
      : 'Too little earnings history to say what is cheap for this company.',
    risk,
    earnings,
  }
}
