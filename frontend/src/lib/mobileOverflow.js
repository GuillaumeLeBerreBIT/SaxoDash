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
  '/accounts',
  '/spending',
]

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
  if (argv.length === 0) return parsed
  for (let i = 0; i < argv.length; i += 2) {
    const flag = FLAGS[argv[i]]
    if (flag && argv[i + 1] !== undefined) parsed[flag[0]] = flag[1](argv[i + 1])
  }
  return parsed
}

export function formatRow(route, over, offenders) {
  const label = route.padEnd(34)
  const amount = String(over).padStart(4)
  if (over <= 0) return `${label} over ${amount}  OK`
  return `${label} over ${amount}  FAIL  ${offenders.slice(0, 4).join(' | ')}`
}

export function measureOverflow() {
  const width = window.innerWidth
  const offenders = [...document.querySelectorAll('body *')]
    .filter(
      (el) =>
        el.getBoundingClientRect().right > width + 1 &&
        !el.closest('.overflow-x-auto, .overflow-x-scroll') &&
        getComputedStyle(el).position !== 'fixed',
    )
    .slice(0, 4)
    .map(
      (el) =>
        `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}:${Math.round(el.getBoundingClientRect().right)}`,
    )
  return { over: document.documentElement.scrollWidth - width, offenders }
}
