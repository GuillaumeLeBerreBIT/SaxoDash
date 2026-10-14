import { afterEach, describe, expect, it } from 'vitest'

import { RAIL_WIDTH, WATCHLIST_HEIGHT, clampSize, readSize, writeSize } from './railLayout'

afterEach(() => localStorage.clear())

describe('clampSize', () => {
  it('keeps a size inside its limits and rounds it', () => {
    expect(clampSize(100, RAIL_WIDTH)).toBe(RAIL_WIDTH.min)
    expect(clampSize(9999, RAIL_WIDTH)).toBe(RAIL_WIDTH.max)
    expect(clampSize(333.6, RAIL_WIDTH)).toBe(334)
  })
})

describe('readSize and writeSize', () => {
  it('starts from the initial size when nothing is stored', () => {
    expect(readSize('saxodash:test-size', WATCHLIST_HEIGHT)).toBe(WATCHLIST_HEIGHT.initial)
  })

  it('reads back a stored size, clamped', () => {
    writeSize('saxodash:test-size', 420)
    expect(readSize('saxodash:test-size', WATCHLIST_HEIGHT)).toBe(420)

    writeSize('saxodash:test-size', 99999)
    expect(readSize('saxodash:test-size', WATCHLIST_HEIGHT)).toBe(WATCHLIST_HEIGHT.max)
  })

  it('ignores a stored value that is not a size', () => {
    localStorage.setItem('saxodash:test-size', 'wide')
    expect(readSize('saxodash:test-size', RAIL_WIDTH)).toBe(RAIL_WIDTH.initial)
  })
})
