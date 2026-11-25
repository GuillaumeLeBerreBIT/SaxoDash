import { generatePath } from 'react-router-dom'

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/research', label: 'Research' },
  { to: '/charts', label: 'Charts' },
  { to: '/boards', label: 'Boards' },
  { to: '/discover', label: 'Discover' },
  { to: '/earnings', label: 'Earnings' },
  { to: '/investors', label: 'Investors' },
  { to: '/analytics', label: 'Analytics' },
]

export const SETTINGS_ITEM = { to: '/settings', label: 'Settings' }

export const MOBILE_PRIMARY = ['/', '/portfolio', '/research', '/discover']

export function mobileOverflow(items = NAV_ITEMS) {
  return [...items.filter((item) => !MOBILE_PRIMARY.includes(item.to)), SETTINGS_ITEM]
}

export function ownsPath(item, pathname) {
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export function pageTitle(pathname) {
  const item = [...NAV_ITEMS, SETTINGS_ITEM].find((candidate) => ownsPath(candidate, pathname))
  return item ? item.label : 'SaxoDash'
}

export const LEGACY_REDIRECTS = [
  { from: 'research/chart', to: '/charts' },
  { from: 'transactions', to: '/portfolio', set: { view: 'transactions' } },
]

export const RETIRED_PATHS = [
  'money',
  'money/accounts/:accountId',
  'accounts',
  'accounts/:accountId',
  'spending',
  'spending/transactions',
]

export function legacyTarget({ to, set = {} }, params = {}, search = '') {
  const query = new URLSearchParams(set)
  for (const [key, value] of new URLSearchParams(search)) {
    if (!(key in set)) query.append(key, value)
  }
  const rendered = query.toString()
  return `${generatePath(to, params)}${rendered ? `?${rendered}` : ''}`
}
