import { describe, expect, it } from 'vitest'
import { ROUTES, formatRow, parseArgs } from './mobileOverflow'

describe('mobile overflow helpers', () => {
  it('lists every shell route once', () => {
    expect(new Set(ROUTES).size).toBe(ROUTES.length)
    expect(ROUTES).toEqual(expect.arrayContaining(['/', '/portfolio', '/analytics', '/research', '/research/chart', '/discover', '/earnings', '/investors', '/transactions', '/accounts', '/spending']))
  })
  it('parses flags with defaults', () => {
    expect(parseArgs(['--base', 'http://x', '--auth', 'a.json'])).toEqual({ base: 'http://x', auth: 'a.json', width: 390, accountId: '1', investorSlug: 'berkshire-hathaway' })
    expect(parseArgs(['--width', '320', '--base', 'b', '--auth', 'c']).width).toBe(320)
  })
  it('formats a pass and a fail row', () => {
    expect(formatRow('/spending', 0, [])).toMatch(/\/spending\s+over\s+0\s+OK/)
    expect(formatRow('/spending', 81, ['button.x:471'])).toMatch(/FAIL.*button\.x:471/)
  })
})
