import { fmtEur } from './format'
import { displayName } from './names'
import { WEIGHT_CAP_PCT } from './portfolioStats'

export const BRIEF_LIMIT = 5
const SOON_DAYS = 3

const WORDS = ['Nothing', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const FAILED_PREFIX = 'Story check failed: '

function listed(labels) {
  const lower = labels.map((label, index) => (index === 0 ? label : label.toLowerCase()))
  if (lower.length < 2) return lower.join('')
  return `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`
}

function result(pnlPct) {
  if (pnlPct == null) return ''
  const n = Number(pnlPct)
  return ` You are ${n >= 0 ? 'up' : 'down'} ${Math.abs(n).toFixed(1)}% on it.`
}

function review(position, verdict) {
  const failed = verdict.reason?.startsWith(FAILED_PREFIX) ? verdict.reason.slice(FAILED_PREFIX.length).split(', ') : []
  const lead = failed.length ? `${listed(failed)} now ${failed.length === 1 ? 'fails' : 'fail'} the quality checks.` : 'The business no longer passes the quality checks.'
  return {
    kind: 'review',
    tone: 'warn',
    word: 'Review',
    title: `${position.name} needs a second look`,
    body: `${lead}${result(position.pnl_pct)} Review means read the story again before deciding, not sell.`,
  }
}

function overCap(position, verdict, total) {
  const weight = Number(position.weight)
  const free = Number(position.value) - (total * WEIGHT_CAP_PCT) / 100
  return {
    kind: 'cap',
    tone: 'warn',
    word: 'Trim',
    title: `${position.name} is ${weight.toFixed(1)}% of your portfolio`,
    body: `Your cap is ${WEIGHT_CAP_PCT}%. Trimming back to ${WEIGHT_CAP_PCT}% would free about ${fmtEur(Math.max(0, free), { decimals: 0 })}. This is about concentration, not the company.`,
  }
}

const whenText = (days) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`)

export function briefItems({ positions, verdicts, total, fundBuys, fundSells, earnings }) {
  const items = []
  const named = (position) => ({ ...position, name: displayName(position.name) || position.ticker })
  const byTicker = new Map(positions.map((position) => [position.ticker, named(position)]))
  const push = (position, item) => items.push({ ticker: position.ticker, uic: position.uic, ...item })

  for (const position of positions.map(named)) {
    const verdict = verdicts?.[position.ticker]
    if (verdict?.action === 'sell_review') push(position, review(position, verdict))
  }
  const reports = (earnings ?? []).filter((report) => byTicker.has(report.ticker))
  const reportItem = (report) => {
    const position = byTicker.get(report.ticker)
    push(position, { kind: 'earnings', tone: 'earn', title: `${position.name} reports ${whenText(report.days_until)}`, body: 'A report can move the price sharply in one session; a stop does not protect against a gap.' })
  }
  reports.filter((report) => report.days_until <= SOON_DAYS).forEach(reportItem)
  for (const position of positions.map(named)) {
    if (Number(position.weight) > WEIGHT_CAP_PCT) push(position, overCap(position, verdicts?.[position.ticker], total))
  }
  for (const position of positions.map(named)) {
    const count = fundBuys?.get(position.ticker)
    if (count) push(position, { kind: 'funds', tone: 'neutral', title: `${count} tracked funds bought ${position.name} last quarter`, body: 'Funds file 45 days after the quarter ends, so this is old news for them and new news for you.' })
  }
  for (const position of positions.map(named)) {
    const count = fundSells?.get(position.ticker)
    if (count) push(position, { kind: 'funds', tone: 'neutral', title: `${count} tracked funds sold ${position.name} last quarter`, body: 'Selling by funds is not a verdict on the company; it is worth reading why.' })
  }
  reports.filter((report) => !(report.days_until <= SOON_DAYS)).forEach(reportItem)
  return items.slice(0, BRIEF_LIMIT)
}

export function briefHeadline(count, { checking = false, unchecked = 0 } = {}) {
  if (count === 0 && checking) return 'Checking your holdings.'
  if (count === 0 && unchecked) return 'Not every holding could be checked today.'
  if (count === 0) return 'Nothing in your portfolio needs you today.'
  const amount = WORDS[count] ?? String(count)
  return `${amount} ${count === 1 ? 'thing' : 'things'} to look at in your portfolio today.`
}

export function checkNote({ checking = false, unchecked = 0 } = {}) {
  if (checking) return 'Still checking your holdings against the quality rules.'
  if (!unchecked) return null
  const holdings = unchecked === 1 ? 'One holding' : `${WORDS[unchecked] ?? unchecked} holdings`
  return `${holdings} could not be checked against the quality rules, so this list may be incomplete.`
}
