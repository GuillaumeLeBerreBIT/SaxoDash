import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeSinceLastLook, recordLook } from './lastLook'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('lastLook', () => {
  it('returns null for a symbol that has never been looked at', () => {
    expect(changeSinceLastLook('AAPL', 150)).toBeNull()
  })

  it('returns the % move since the recorded price', () => {
    recordLook('AAPL', 100)
    expect(changeSinceLastLook('AAPL', 110)).toBeCloseTo(10)
  })

  it('returns a negative % for a drop', () => {
    recordLook('AAPL', 100)
    expect(changeSinceLastLook('AAPL', 90)).toBeCloseTo(-10)
  })

  it('tracks each symbol independently', () => {
    recordLook('AAPL', 100)
    recordLook('NVDA', 200)
    expect(changeSinceLastLook('AAPL', 105)).toBeCloseTo(5)
    expect(changeSinceLastLook('NVDA', 220)).toBeCloseTo(10)
  })

  it('overwrites the previous recorded price on a repeat look', () => {
    recordLook('AAPL', 100)
    recordLook('AAPL', 120)
    expect(changeSinceLastLook('AAPL', 120)).toBeCloseTo(0)
  })

  it('ignores a missing symbol or price when recording', () => {
    recordLook('', 100)
    recordLook('AAPL', null)
    expect(changeSinceLastLook('AAPL', 100)).toBeNull()
  })

  it('returns null when the current price is not known yet', () => {
    recordLook('AAPL', 100)
    expect(changeSinceLastLook('AAPL', null)).toBeNull()
  })

  it('returns null when reading throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(changeSinceLastLook('AAPL', 100)).toBeNull()
  })

  it('does not throw when writing throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => recordLook('AAPL', 100)).not.toThrow()
  })
})
