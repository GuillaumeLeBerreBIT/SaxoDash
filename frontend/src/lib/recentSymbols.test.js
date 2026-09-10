import { afterEach, describe, expect, it, vi } from 'vitest'
import { readRecentSymbols, pushRecentSymbol } from './recentSymbols'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('recentSymbols', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(readRecentSymbols()).toEqual([])
  })

  it('pushes newest-first and dedups', () => {
    pushRecentSymbol('AAPL')
    pushRecentSymbol('NVDA')
    pushRecentSymbol('AAPL')
    expect(readRecentSymbols()).toEqual(['AAPL', 'NVDA'])
  })

  it('caps the list at eight', () => {
    for (const s of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) pushRecentSymbol(s)
    expect(readRecentSymbols()).toHaveLength(8)
    expect(readRecentSymbols()[0]).toBe('I')
  })

  it('ignores a falsy symbol', () => {
    pushRecentSymbol('')
    expect(readRecentSymbols()).toEqual([])
  })

  it('returns [] when reading throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readRecentSymbols()).toEqual([])
  })

  it('does not throw when writing throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => pushRecentSymbol('AAPL')).not.toThrow()
  })
})
