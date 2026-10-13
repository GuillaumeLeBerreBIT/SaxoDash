import { describe, expect, it } from 'vitest'

import {
  TRANSACTION_LABELS,
  filterTransactions,
  insiderName,
  isOpenMarket,
  netActivity,
  sentimentRows,
  transactionLabel,
} from './insiders'

describe('transactionLabel', () => {
  it.each([
    ['P', 'Buy'],
    ['S', 'Sell'],
    ['A', 'Award'],
    ['M', 'Option exercise'],
    ['X', 'Option exercise'],
    ['F', 'Tax withholding'],
    ['G', 'Gift'],
    ['C', 'Conversion'],
    ['D', 'Returned to issuer'],
    ['J', 'Other'],
    ['', 'Other'],
    [null, 'Other'],
  ])('%s is %s', (code, label) => {
    expect(transactionLabel(code)).toBe(label)
  })

  it('exposes the table it reads', () => {
    expect(TRANSACTION_LABELS.P).toBe('Buy')
  })
})

describe('isOpenMarket', () => {
  it('is true for a purchase and a sale only', () => {
    expect(isOpenMarket({ code: 'P' })).toBe(true)
    expect(isOpenMarket({ code: 'S' })).toBe(true)
    expect(isOpenMarket({ code: 'A' })).toBe(false)
    expect(isOpenMarket({ code: 'M' })).toBe(false)
  })
})

describe('filterTransactions', () => {
  const rows = [{ code: 'S' }, { code: 'A' }, { code: 'P' }, { code: 'G' }]

  it('keeps open-market rows by default', () => {
    expect(filterTransactions(rows)).toEqual([{ code: 'S' }, { code: 'P' }])
  })

  it('keeps open-market rows for the open scope', () => {
    expect(filterTransactions(rows, 'open')).toEqual([{ code: 'S' }, { code: 'P' }])
  })

  it('keeps every row for the all scope', () => {
    expect(filterTransactions(rows, 'all')).toEqual(rows)
  })

  it('treats an unknown scope as open', () => {
    expect(filterTransactions(rows, 'weird')).toEqual([{ code: 'S' }, { code: 'P' }])
  })

  it('answers an empty list without rows', () => {
    expect(filterTransactions(undefined)).toEqual([])
  })
})

describe('insiderName', () => {
  it('title-cases an upper-case name', () => {
    expect(insiderName('COXE TENCH')).toBe('Coxe Tench')
  })

  it('leaves a mixed-case name alone', () => {
    expect(insiderName('Jensen Huang')).toBe('Jensen Huang')
  })

  it('answers an empty string for nothing', () => {
    expect(insiderName('')).toBe('')
    expect(insiderName(null)).toBe('')
  })
})

describe('netActivity', () => {
  const summary = { buys: 0, sells: 14, shares_bought: 0, shares_sold: 1_200_000 }

  it('is null without a summary', () => {
    expect(netActivity(null)).toBeNull()
    expect(netActivity(undefined)).toBeNull()
  })

  it('is null when nothing was bought or sold', () => {
    expect(netActivity({ ...summary, buys: 0, sells: 0 })).toBeNull()
  })

  it('describes net selling', () => {
    expect(netActivity(summary)).toEqual({
      tone: 'sell',
      text: 'Insiders sold 1.20M shares net over 14 sales and 0 buys',
    })
  })

  it('describes net buying', () => {
    expect(netActivity({ buys: 3, sells: 1, shares_bought: 50_000, shares_sold: 10_000 })).toEqual({
      tone: 'buy',
      text: 'Insiders bought 40.0K shares net over 1 sale and 3 buys',
    })
  })

  it('is flat when bought and sold shares are equal', () => {
    const result = netActivity({ buys: 1, sells: 1, shares_bought: 500, shares_sold: 500 })
    expect(result.tone).toBe('flat')
  })
})

describe('sentimentRows', () => {
  it('labels each month and keeps its figures', () => {
    expect(sentimentRows([{ month: '2026-09', mspr: -12.5, change: -400 }])).toEqual([
      { month: '2026-09', label: 'Sep 26', mspr: -12.5, change: -400 },
    ])
  })

  it('answers an empty list without rows', () => {
    expect(sentimentRows(undefined)).toEqual([])
  })
})
