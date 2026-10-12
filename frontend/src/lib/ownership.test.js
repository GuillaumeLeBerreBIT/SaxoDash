import { describe, expect, it } from 'vitest'

import { balanceLabel, fundBalance, ownershipTicker, ownershipTickers } from './ownership'

const stock = (overrides = {}) => ({ owners: 0, new: 0, added: 0, trimmed: 0, sold_out: 0, unchanged: 0, ...overrides })

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

describe('fundBalance', () => {
  it('counts new and added as buying, trimmed and sold out as selling', () => {
    expect(fundBalance(stock({ new: 5, added: 1, trimmed: 2, sold_out: 1, unchanged: 9 }))).toEqual({ buying: 6, selling: 3 })
  })

  it('is absent for an unknown stock and for one nobody moved', () => {
    expect(fundBalance(null)).toBeNull()
    expect(fundBalance(undefined)).toBeNull()
    expect(fundBalance(stock({ owners: 4, unchanged: 4 }))).toBeNull()
  })
})

describe('balanceLabel', () => {
  it('says how many tracked funds bought and sold in the quarter', () => {
    expect(balanceLabel({ buying: 6, selling: 1 }, '2026-06-30')).toBe('6 tracked funds buying, 1 selling in Q2 2026')
  })

  it('uses the singular for one fund', () => {
    expect(balanceLabel({ buying: 1, selling: 0 }, '2026-06-30')).toBe('1 tracked fund buying, 0 selling in Q2 2026')
  })
})
