import { describe, expect, it } from 'vitest'
import { ROUTES, routePath, describeLoadFailure, formatLoadFailure, formatRow, parseArgs, describeGateBlindness, formatGateBlind } from './mobileOverflow'

describe('mobile overflow helpers', () => {
  it('lists every shell route once', () => {
    expect(new Set(ROUTES).size).toBe(ROUTES.length)
    expect(ROUTES).toEqual(expect.arrayContaining(['/', '/portfolio', '/analytics', '/research', '/research/chart', '/discover', '/discover/momentum', '/earnings', '/investors', '/transactions', '/accounts', '/spending']))
  })
  it('covers the filtered Transactions and the spending drill-down, each expected to land on its own path', () => {
    const drill = ROUTES.find((r) => r.startsWith('/spending/transactions?'))
    const filtered = ROUTES.find((r) => r.startsWith('/transactions?'))
    expect(drill).toContain('category=GROCERIES')
    expect(filtered).toContain('type=BUY')
    expect(routePath(drill)).toBe('/spending/transactions')
    expect(routePath(filtered)).toBe('/transactions')
    expect(routePath('/portfolio')).toBe('/portfolio')
  })
  it('parses flags with defaults', () => {
    expect(parseArgs(['--base', 'http://x', '--auth', 'a.json'])).toEqual({ base: 'http://x', auth: 'a.json', width: 390, accountId: '1', investorSlug: 'berkshire-hathaway' })
    expect(parseArgs(['--width', '320', '--base', 'b', '--auth', 'c']).width).toBe(320)
  })
  it('formats a pass and a fail row', () => {
    expect(formatRow('/spending', 0, [])).toMatch(/\/spending\s+over\s+0\s+OK/)
    expect(formatRow('/spending', 81, ['button.x:471'])).toMatch(/FAIL.*button\.x:471/)
  })
  it('accepts a route that landed where it was sent and rendered main', () => {
    expect(describeLoadFailure('/spending', '/spending', true)).toBeNull()
  })
  it('describes a redirect and a missing main', () => {
    expect(describeLoadFailure('/accounts/9', '/login', true)).toBe('landed on /login')
    expect(describeLoadFailure('/spending', '/spending', false)).toBe('no main element')
    expect(describeLoadFailure('/accounts/9', '/', false)).toBe('landed on /, no main element')
  })
  it('formats a load failure row', () => {
    expect(formatLoadFailure('/accounts/9', 'landed on /login')).toMatch(/\/accounts\/9\s+NOLOAD\s+landed on \/login/)
  })
  it('rejects a width that is not a positive number', () => {
    for (const bad of ['abc', '0', '-5', '']) {
      expect(() => parseArgs(['--width', bad])).toThrow(/--width/)
    }
  })
  it('reports nothing when neither root hides sideways scroll', () => {
    expect(describeGateBlindness('visible', 'auto')).toBeNull()
    expect(describeGateBlindness('visible', 'visible')).toBeNull()
  })
  it('names the element that hides sideways scroll', () => {
    expect(describeGateBlindness('hidden', 'visible')).toBe('html overflow-x is hidden')
    expect(describeGateBlindness('visible', 'clip')).toBe('body overflow-x is clip')
    expect(describeGateBlindness('hidden', 'hidden')).toBe('html overflow-x is hidden, body overflow-x is hidden')
  })
  it('formats a gate-blind row', () => {
    expect(formatGateBlind('/spending', 'html overflow-x is hidden')).toMatch(/\/spending\s+GATE-BLIND\s+html overflow-x is hidden/)
  })
})
