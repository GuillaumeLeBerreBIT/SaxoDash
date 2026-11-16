import { describe, expect, it } from 'vitest'

import { displayName } from './names'

describe('displayName', () => {
  it('drops legal suffixes and share classes', () => {
    expect(displayName('Alphabet Inc. (Class A)')).toBe('Alphabet')
    expect(displayName('Alphabet Inc. Class A')).toBe('Alphabet')
    expect(displayName('Microsoft Corp.')).toBe('Microsoft')
    expect(displayName('Oracle Corporation')).toBe('Oracle')
    expect(displayName('Adobe Inc.')).toBe('Adobe')
    expect(displayName('Nebius Group NV')).toBe('Nebius Group')
    expect(displayName('Linde plc')).toBe('Linde')
  })

  it('turns an inverted name back around', () => {
    expect(displayName('Lilly (Eli)')).toBe('Eli Lilly')
  })

  it('keeps names that are already plain, and words that belong to the name', () => {
    expect(displayName('Booking Holdings')).toBe('Booking Holdings')
    expect(displayName('Meta Platforms')).toBe('Meta Platforms')
    expect(displayName('Coca-Cola Co')).toBe('Coca-Cola')
  })

  it('falls back to what it was given when nothing is left', () => {
    expect(displayName('Inc.')).toBe('Inc.')
    expect(displayName(null)).toBe('')
  })
})
