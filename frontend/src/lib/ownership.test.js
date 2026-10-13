import { describe, expect, it } from 'vitest'

import { changeLabel, fmtSharesCompact, heldLabel, ownershipTicker, ownershipTickers, sharesChange, sharesHeld } from './ownership'

const stock = (overrides = {}) => ({
  owners: 0, new: 0, added: 0, trimmed: 0, sold_out: 0, unchanged: 0, shares: 0, shares_change: 0, shares_change_pct: null,
  ...overrides,
})

describe('ownershipTicker', () => {
  it('asks about a USD instrument by its upper-cased ticker', () => {
    expect(ownershipTicker({ ticker: 'nbis', currency: 'USD' })).toBe('NBIS')
  })

  it('does not ask about an instrument quoted in another currency', () => {
    expect(ownershipTicker({ ticker: 'ASML', currency: 'EUR' })).toBeNull()
  })

  it('asks when the currency is not known yet', () => {
    expect(ownershipTicker({ ticker: 'MSFT' })).toBe('MSFT')
  })

  it('has nothing to ask without a ticker', () => {
    expect(ownershipTicker({ currency: 'USD' })).toBeNull()
    expect(ownershipTicker()).toBeNull()
  })
})

describe('ownershipTickers', () => {
  it('lists each askable ticker once, in a stable order', () => {
    const positions = [
      { ticker: 'MSFT', currency: 'USD' },
      { ticker: 'ASML', currency: 'EUR' },
      { ticker: 'AAPL', currency: 'USD' },
      { ticker: 'MSFT', currency: 'USD' },
    ]
    expect(ownershipTickers(positions)).toEqual(['AAPL', 'MSFT'])
  })
})

describe('sharesHeld', () => {
  it('is the total tracked funds hold', () => {
    expect(sharesHeld(stock({ shares: 1_240_000 }))).toBe(1_240_000)
  })

  it('is absent for an unknown stock and for one nobody holds', () => {
    expect(sharesHeld(null)).toBeNull()
    expect(sharesHeld(undefined)).toBeNull()
    expect(sharesHeld(stock())).toBeNull()
  })
})

describe('sharesChange', () => {
  it('reports a net purchase as up with its size and percent', () => {
    expect(sharesChange(stock({ shares: 1_240_000, shares_change: 180_000, shares_change_pct: 17.0 })))
      .toEqual({ direction: 'up', shares: 180_000, pct: 17.0 })
  })

  it('reports a net sale as down with a positive size', () => {
    expect(sharesChange(stock({ shares: 5_310_000, shares_change: -420_000, shares_change_pct: -7.3 })))
      .toEqual({ direction: 'down', shares: 420_000, pct: -7.3 })
  })

  it('is absent when nothing changed and for an unknown stock', () => {
    expect(sharesChange(stock({ shares: 2_000_000 }))).toBeNull()
    expect(sharesChange(null)).toBeNull()
  })

  it('keeps a change that has no percent because nothing was held before', () => {
    expect(sharesChange(stock({ shares: 10, shares_change: 10 }))).toEqual({ direction: 'up', shares: 10, pct: null })
  })
})

describe('fmtSharesCompact', () => {
  it('abbreviates to one decimal and drops a trailing .0', () => {
    expect(fmtSharesCompact(41_191_743)).toBe('41.2M')
    expect(fmtSharesCompact(2_000_000)).toBe('2M')
    expect(fmtSharesCompact(1_500_000_000)).toBe('1.5B')
    expect(fmtSharesCompact(45_495)).toBe('45.5K')
  })

  it('keeps a small count whole and rolls a near-boundary count up a unit', () => {
    expect(fmtSharesCompact(641)).toBe('641')
    expect(fmtSharesCompact(999_950)).toBe('1M')
  })
})

describe('labels', () => {
  it('say what was held at quarter end', () => {
    expect(heldLabel(1_240_000, '2026-06-30')).toBe('Tracked funds hold 1,240,000 shares at the end of Q2 2026')
  })

  it('say whether tracked funds net bought or sold', () => {
    expect(changeLabel({ direction: 'up', shares: 180_000 }, '2026-06-30')).toBe('Tracked funds net bought 180,000 shares in Q2 2026')
    expect(changeLabel({ direction: 'down', shares: 420_000 }, '2026-06-30')).toBe('Tracked funds net sold 420,000 shares in Q2 2026')
  })
})
