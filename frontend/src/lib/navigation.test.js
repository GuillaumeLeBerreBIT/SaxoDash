import { describe, expect, it } from 'vitest'
import { PAGE_COMMANDS } from './commands'
import { LEGACY_REDIRECTS, MOBILE_PRIMARY, NAV_ITEMS, RETIRED_PATHS, legacyTarget, mobileOverflow, pageTitle, visibleTo } from './navigation'

describe('top-level navigation', () => {
  it('lists the nine tabs in order', () => {
    expect(NAV_ITEMS).toEqual([
      { to: '/', label: 'Overview', end: true },
      { to: '/portfolio', label: 'Portfolio' },
      { to: '/research', label: 'Research' },
      { to: '/charts', label: 'Charts' },
      { to: '/boards', label: 'Boards' },
      { to: '/discover', label: 'Discover' },
      { to: '/earnings', label: 'Earnings' },
      { to: '/investors', label: 'Investors' },
      { to: '/analytics', label: 'Analytics' },
    ])
  })
})

describe('mobile navigation split', () => {
  it('keeps the four primary destinations in tab order', () => {
    expect(MOBILE_PRIMARY).toEqual(['/', '/portfolio', '/research', '/discover'])
  })

  it('puts every other destination plus Settings in More, each exactly once', () => {
    expect(mobileOverflow().map((item) => item.to)).toEqual([
      '/charts',
      '/boards',
      '/earnings',
      '/investors',
      '/analytics',
      '/settings',
    ])
  })
})

describe('palette pages', () => {
  it('offers every tab plus Settings, in the same order, then the deep links', () => {
    expect(PAGE_COMMANDS).toEqual([
      ...NAV_ITEMS.map(({ to, label }) => ({ to, label })),
      { to: '/settings', label: 'Settings' },
      { to: '/portfolio?view=transactions', label: 'Transactions' },
    ])
  })
})

describe('owner-only entries', () => {
  const items = [{ to: '/a', label: 'A' }, { to: '/b', label: 'B', ownerOnly: true }]

  it('are shown to the owner', () => {
    expect(visibleTo(items, { is_owner: true })).toEqual(items)
  })

  it('are hidden from everyone else, and while the user is still loading', () => {
    expect(visibleTo(items, { is_owner: false })).toEqual([items[0]])
    expect(visibleTo(items, undefined)).toEqual([items[0]])
  })
})

describe('legacy redirects', () => {
  const target = (from, params = {}, search = '') =>
    legacyTarget(LEGACY_REDIRECTS.find((r) => r.from === from), params, search)

  it('covers every old route', () => {
    expect(LEGACY_REDIRECTS.map((r) => r.from)).toEqual([
      'research/chart',
      'transactions',
    ])
  })

  it('keeps the query and puts the new section first', () => {
    expect(target('research/chart', {}, '?symbol=NVDA')).toBe('/charts?symbol=NVDA')
    expect(target('transactions', {}, '?type=BUY')).toBe('/portfolio?view=transactions&type=BUY')
  })

  it('lets the redirect own the section it sets', () => {
    expect(target('transactions', {}, '?view=positions&type=BUY')).toBe('/portfolio?view=transactions&type=BUY')
  })
})

describe('retired Money paths', () => {
  it('lists every Money address, old and new', () => {
    expect(RETIRED_PATHS).toEqual([
      'money',
      'money/accounts/:accountId',
      'accounts',
      'accounts/:accountId',
      'spending',
      'spending/transactions',
    ])
  })
})

describe('pageTitle', () => {
  it('names the tab that owns the path', () => {
    expect(pageTitle('/')).toBe('Overview')
    expect(pageTitle('/investors/stocks')).toBe('Investors')
    expect(pageTitle('/analytics')).toBe('Analytics')
    expect(pageTitle('/settings')).toBe('Settings')
  })
})
