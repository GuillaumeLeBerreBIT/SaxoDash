import { describe, expect, it } from 'vitest'
import { txDayGroups, txDayLabel, txDaySummary, txPrice, txTone, txSignedTotal, txTotal, txTotalClass, txTypes } from './transactions'

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
    expect(txTotalClass(tx({ type: 'SELL' }))).toBe('text-up')
    expect(txTotalClass(tx({ type: 'BUY' }))).toBe('text-ink')
    expect(txTotalClass(tx({ type: 'INTEREST' }))).toBe('text-ink')
  })

  it('stays neutral for an inflow whose EUR total is unknown', () => {
    expect(txTotalClass(tx({ type: 'SELL', total_eur: null }))).toBe('text-ink')
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

describe('txSignedTotal', () => {
  it('is negative for outflows, positive for inflows and unsigned otherwise', () => {
    expect(txSignedTotal(tx({ type: 'BUY', total_eur: '500.00' }))).toBe(-500)
    expect(txSignedTotal(tx({ type: 'FEE', total_eur: '5.00' }))).toBe(-5)
    expect(txSignedTotal(tx({ type: 'SELL', total_eur: '300.00' }))).toBe(300)
    expect(txSignedTotal(tx({ type: 'DEPOSIT', total_eur: '10.00' }))).toBe(10)
    expect(txSignedTotal(tx({ type: 'INTEREST', total_eur: '2.00' }))).toBe(2)
  })

  it('is null when the euro total is missing', () => {
    expect(txSignedTotal(tx({ total_eur: null }))).toBeNull()
  })
})

describe('txDayLabel', () => {
  it('names the weekday before the date', () => {
    expect(txDayLabel('2026-09-02')).toBe('Wed 02 Sep 2026')
  })

  it('shows a dash for a missing date', () => {
    expect(txDayLabel(null)).toBe('—')
  })
})

describe('txDayGroups', () => {
  it('groups consecutive rows that share a date and keeps their order', () => {
    const rows = [{ id: 1, date: 'b' }, { id: 2, date: 'b' }, { id: 3, date: 'a' }, { id: 4, date: 'b' }]
    expect(txDayGroups(rows).map((g) => [g.date, g.rows.map((r) => r.id)])).toEqual([
      ['b', [1, 2]],
      ['a', [3]],
      ['b', [4]],
    ])
  })
})

describe('txDaySummary', () => {
  it('sums buys and sells in euros', () => {
    expect(txDaySummary([tx({ total_eur: '100' }), tx({ total_eur: '50' }), tx({ type: 'SELL', total_eur: '20' })])).toBe(
      'Bought €150.00 · sold €20.00',
    )
  })

  it('leaves out a side with a trade whose euro total was never reported', () => {
    expect(txDaySummary([tx({ total_eur: null }), tx({ type: 'SELL', total_eur: '20' })])).toBe('Sold €20.00')
  })

  it('says nothing for a day without buys or sells', () => {
    expect(txDaySummary([tx({ type: 'DIVIDEND' })])).toBeNull()
  })
})
