import { describe, expect, it } from 'vitest'

import { instrumentLogoUrl } from './logos'

describe('instrumentLogoUrl', () => {
  it('builds an elbstream lookup URL from an ISIN', () => {
    expect(instrumentLogoUrl('US0378331005')).toBe('https://api.elbstream.com/logos/isin/US0378331005')
  })

  it('is null without an ISIN', () => {
    expect(instrumentLogoUrl(null)).toBeNull()
    expect(instrumentLogoUrl(undefined)).toBeNull()
    expect(instrumentLogoUrl('')).toBeNull()
  })
})
