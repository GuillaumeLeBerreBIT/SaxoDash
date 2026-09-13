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
})
