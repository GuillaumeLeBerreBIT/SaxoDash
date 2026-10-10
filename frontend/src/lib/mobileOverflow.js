export const ROUTES = [
  '/',
  '/portfolio',
  '/analytics',
  '/research',
  '/research/chart',
  '/discover',
  '/discover/momentum',
  '/earnings',
  '/investors',
  '/transactions',
  '/transactions?type=BUY&from=2026-01-01',
  '/accounts',
  '/spending',
  '/spending/transactions?category=GROCERIES&from=2026-01-01&to=2026-12-31',
]

export function routePath(route) {
  return route.split('?')[0]
}

const DEFAULTS = {
  base: 'http://localhost:5273',
  auth: '',
  width: 390,
  accountId: '1',
  investorSlug: 'berkshire-hathaway',
}

const FLAGS = {
  '--base': ['base', String],
  '--auth': ['auth', String],
  '--width': ['width', Number],
  '--account-id': ['accountId', String],
  '--investor-slug': ['investorSlug', String],
}

export function parseArgs(argv) {
  const parsed = { ...DEFAULTS }
  for (let i = 0; i < argv.length; i += 2) {
    const flag = FLAGS[argv[i]]
    if (flag && argv[i + 1] !== undefined) parsed[flag[0]] = flag[1](argv[i + 1])
  }
  if (!Number.isFinite(parsed.width) || parsed.width <= 0) {
    throw new Error(`--width must be a positive number, got ${JSON.stringify(parsed.width)}`)
  }
  return parsed
}

export function formatRow(route, over, offenders) {
  const label = route.padEnd(34)
  const amount = String(over).padStart(4)
  if (over <= 0) return `${label} over ${amount}  OK`
  return `${label} over ${amount}  FAIL  ${offenders.slice(0, 4).join(' | ')}`
}

const SCROLL_HIDING = new Set(['hidden', 'clip'])

export function describeGateBlindness(htmlOverflowX, bodyOverflowX) {
  const hiding = []
  if (SCROLL_HIDING.has(htmlOverflowX)) hiding.push(`html overflow-x is ${htmlOverflowX}`)
  if (SCROLL_HIDING.has(bodyOverflowX)) hiding.push(`body overflow-x is ${bodyOverflowX}`)
  return hiding.length ? hiding.join(', ') : null
}

export function formatGateBlind(label, found) {
  return `${label.padEnd(34)} GATE-BLIND  ${found}`
}

export function describeLoadFailure(expectedPath, actualPath, hasMain) {
  const problems = []
  if (actualPath !== expectedPath) problems.push(`landed on ${actualPath}`)
  if (!hasMain) problems.push('no main element')
  return problems.length ? problems.join(', ') : null
}

export function formatLoadFailure(label, found) {
  return `${label.padEnd(34)} NOLOAD  ${found}`
}

export function measureOverflow() {
  const width = window.innerWidth
  const offenders = [...document.querySelectorAll('body *')]
    .filter(
      (el) =>
        el.getBoundingClientRect().right > width + 1 &&
        !el.closest('.overflow-x-auto, .overflow-x-scroll, .overflow-auto, .overflow-scroll, .overflow-x-hidden, .overflow-hidden') &&
        getComputedStyle(el).position !== 'fixed',
    )
    .slice(0, 4)
    .map(
      (el) =>
        `${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(' ').slice(0, 3).join('.')}:${Math.round(el.getBoundingClientRect().right)}`,
    )
  return {
    over: document.documentElement.scrollWidth - width,
    offenders,
    htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
  }
}
