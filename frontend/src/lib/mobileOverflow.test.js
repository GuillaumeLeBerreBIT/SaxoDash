import { describe, expect, it } from 'vitest'
import { ROUTES, describeLoadFailure, formatLoadFailure, formatRow, parseArgs } from './mobileOverflow'

describe('mobile overflow helpers', () => {
  it('lists every shell route once', () => {
    expect(new Set(ROUTES).size).toBe(ROUTES.length)
    expect(ROUTES).toEqual(expect.arrayContaining(['/', '/portfolio', '/analytics', '/research', '/research/chart', '/discover', '/discover/momentum', '/earnings', '/investors', '/transactions', '/accounts', '/spending']))
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
})
