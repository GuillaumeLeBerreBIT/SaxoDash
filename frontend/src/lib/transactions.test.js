import { describe, expect, it } from 'vitest'
import { txPrice, txTone, txTotal, txTotalClass, txTypes } from './transactions'

const tx = (overrides) => ({
  type: 'BUY', price: '150.00', currency: 'USD', total: '1500.00', total_eur: '1290.13', ...overrides,
})

describe('txPrice', () => {
  it('formats in the transaction currency', () => {
    expect(txPrice(tx())).toBe('US$150.00')
  })

  it('shows a bare number when the currency is unknown', () => {
    expect(txPrice(tx({ currency: null }))).toBe('150.00')
  })

  it('shows a dash when the price is absent', () => {
    expect(txPrice(tx({ price: null }))).toBe('—')
  })
})

describe('txTotal', () => {
  it('shows a purchase as an outflow', () => {
    expect(txTotal(tx({ type: 'BUY' }))).toBe('-€1,290.13')
  })

  it('shows a sale, dividend and deposit as inflows', () => {
    expect(txTotal(tx({ type: 'SELL' }))).toBe('+€1,290.13')
    expect(txTotal(tx({ type: 'DIVIDEND' }))).toBe('+€1,290.13')
    expect(txTotal(tx({ type: 'DEPOSIT' }))).toBe('+€1,290.13')
  })

  it('shows a fee as an outflow', () => {
    expect(txTotal(tx({ type: 'FEE' }))).toBe('-€1,290.13')
  })

  it('leaves an unrecognised type unsigned', () => {
    expect(txTotal(tx({ type: 'INTEREST' }))).toBe('€1,290.13')
  })

  it('ignores the sign the backend sent', () => {
    expect(txTotal(tx({ type: 'BUY', total_eur: '-1290.13' }))).toBe('-€1,290.13')
  })

  it('shows a dash when the EUR total is unknown', () => {
    expect(txTotal(tx({ total_eur: null }))).toBe('—')
  })
})

describe('txTotalClass', () => {
  it('colours inflows green and everything else neutral', () => {
    expect(txTotalClass(tx({ type: 'SELL' }))).toBe('text-emerald-400')
    expect(txTotalClass(tx({ type: 'BUY' }))).toBe('text-zinc-100')
    expect(txTotalClass(tx({ type: 'INTEREST' }))).toBe('text-zinc-100')
  })
})

describe('txTone', () => {
  it('maps known types and falls back to zinc', () => {
    expect(txTone('BUY')).toBe('blue')
    expect(txTone('FEE')).toBe('red')
    expect(txTone('INTEREST')).toBe('zinc')
  })
})

describe('txTypes', () => {
  it('lists only the types present, canonical order first', () => {
    const rows = [{ type: 'FEE' }, { type: 'BUY' }, { type: 'BUY' }, { type: 'INTEREST' }, { type: 'DIVIDEND' }]
    expect(txTypes(rows)).toEqual(['All', 'BUY', 'DIVIDEND', 'FEE', 'INTEREST'])
  })

  it('is just All for no rows', () => {
    expect(txTypes([])).toEqual(['All'])
  })
})
