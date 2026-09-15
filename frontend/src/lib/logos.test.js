import { describe, expect, it } from 'vitest'

import { instrumentLogoUrl } from './logos'

describe('instrumentLogoUrl', () => {
  it('builds an elbstream lookup URL from a ticker symbol', () => {
    expect(instrumentLogoUrl('AAPL')).toBe('https://api.elbstream.com/logos/symbol/AAPL')
  })

  it('is null without a symbol', () => {
    expect(instrumentLogoUrl(null)).toBeNull()
    expect(instrumentLogoUrl(undefined)).toBeNull()
    expect(instrumentLogoUrl('')).toBeNull()
  })

  it('routes a known ISIN-only fund to the isin endpoint instead of symbol', () => {
    expect(instrumentLogoUrl('IWDA')).toBe('https://api.elbstream.com/logos/isin/IE00B4L5Y983')
  })

  it('matches the override case-insensitively', () => {
    expect(instrumentLogoUrl('iwda')).toBe('https://api.elbstream.com/logos/isin/IE00B4L5Y983')
  })
})
