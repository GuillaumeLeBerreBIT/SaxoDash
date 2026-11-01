import { describe, expect, it } from 'vitest'
import { PAGE_COMMANDS } from './commands'
import { LEGACY_REDIRECTS, MOBILE_PRIMARY, NAV_ITEMS, legacyTarget, mobileOverflow, pageTitle } from './navigation'

describe('top-level navigation', () => {
  it('lists the nine tabs in order', () => {
    expect(NAV_ITEMS).toEqual([
      { to: '/', label: 'Overview', end: true },
      { to: '/portfolio', label: 'Portfolio' },
      { to: '/research', label: 'Research' },
      { to: '/boards', label: 'Boards' },
      { to: '/discover', label: 'Discover' },
      { to: '/earnings', label: 'Earnings' },
      { to: '/investors', label: 'Investors' },
      { to: '/analytics', label: 'Analytics' },
      { to: '/money', label: 'Money' },
    ])
  })
})

describe('mobile navigation split', () => {
  it('keeps the four primary destinations in tab order', () => {
    expect(MOBILE_PRIMARY).toEqual(['/', '/portfolio', '/research', '/discover'])
  })

  it('puts every other destination plus Settings in More, each exactly once', () => {
    expect(mobileOverflow().map((item) => item.to)).toEqual([
      '/boards',
      '/earnings',
      '/investors',
      '/analytics',
      '/money',
      '/settings',
    ])
  })
})

describe('palette pages', () => {
  it('offers every tab plus Settings, in the same order', () => {
    expect(PAGE_COMMANDS).toEqual([
      ...NAV_ITEMS.map(({ to, label }) => ({ to, label })),
      { to: '/settings', label: 'Settings' },
    ])
  })
})

describe('legacy redirects', () => {
  const target = (from, params = {}, search = '') =>
    legacyTarget(LEGACY_REDIRECTS.find((r) => r.from === from), params, search)

  it('covers every old route', () => {
    expect(LEGACY_REDIRECTS.map((r) => r.from)).toEqual([
      'research/chart',
      'transactions',
      'accounts',
      'accounts/:accountId',
      'spending',
      'spending/transactions',
    ])
  })

  it('keeps the query and puts the new section first', () => {
    expect(target('research/chart', {}, '?symbol=NVDA')).toBe('/boards?symbol=NVDA')
    expect(target('transactions', {}, '?type=BUY')).toBe('/portfolio?view=transactions&type=BUY')
    expect(target('accounts')).toBe('/money?section=accounts')
    expect(target('accounts/:accountId', { accountId: '7' }, '?x=1')).toBe('/money/accounts/7?x=1')
    expect(target('spending', {}, '?period=3m')).toBe('/money?section=spending&period=3m')
    expect(target('spending/transactions', {}, '?category=GROCERIES')).toBe(
      '/money?section=transactions&category=GROCERIES',
    )
  })

  it('lets the redirect own the section it sets', () => {
    expect(target('spending', {}, '?section=accounts&period=1m')).toBe('/money?section=spending&period=1m')
  })
})

describe('pageTitle', () => {
  it('names the tab that owns the path', () => {
    expect(pageTitle('/')).toBe('Overview')
    expect(pageTitle('/investors/stocks')).toBe('Investors')
    expect(pageTitle('/money/accounts/3')).toBe('Money')
    expect(pageTitle('/settings')).toBe('Settings')
  })
})
