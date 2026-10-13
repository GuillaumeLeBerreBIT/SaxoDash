import { describe, expect, it } from 'vitest'

import { balanceRows, cashAndDebtRows } from './financialHealth'

const year = (fiscal_year, balance = {}, cash_flow = {}) => ({
  period: `${fiscal_year}-12-31`,
  fiscal_year,
  label: `FY ${fiscal_year}`,
  income: {},
  balance,
  cash_flow,
})

describe('cashAndDebtRows', () => {
  it('maps free cash flow, cash and total debt', () => {
    const rows = cashAndDebtRows([year(2025, { cash: 5, total_debt: 9 }, { free_cash_flow: 7 })])

    expect(rows).toEqual([{ label: 'FY 2025', free_cash_flow: 7, cash: 5, total_debt: 9 }])
  })

  it('leaves out a figure the company did not report', () => {
    const [row] = cashAndDebtRows([year(2025, { cash: 5 }, {})])

    expect(row).toEqual({ label: 'FY 2025', cash: 5 })
    expect('total_debt' in row).toBe(false)
  })

  it('keeps a zero figure', () => {
    const [row] = cashAndDebtRows([year(2025, { total_debt: 0 })])

    expect(row.total_debt).toBe(0)
  })

  it('drops a year with none of the three', () => {
    const rows = cashAndDebtRows([year(2024, { total_assets: 1 }), year(2025, { cash: 5 })])

    expect(rows.map((row) => row.label)).toEqual(['FY 2025'])
  })

  it('keeps the newest ten years in order', () => {
    const annual = Array.from({ length: 12 }, (_, i) => year(2014 + i, { cash: i + 1 }))

    const rows = cashAndDebtRows(annual)

    expect(rows).toHaveLength(10)
    expect(rows[0].label).toBe('FY 2016')
    expect(rows.at(-1).label).toBe('FY 2025')
  })

  it('answers an empty list for undefined', () => {
    expect(cashAndDebtRows(undefined)).toEqual([])
  })
})

describe('balanceRows', () => {
  const full = { total_assets: 100, current_assets: 40, total_liabilities: 70, current_liabilities: 30 }

  it('derives the long-term figures as total minus current', () => {
    expect(balanceRows([year(2025, full)])).toEqual([
      {
        label: 'FY 2025',
        current_assets: 40,
        long_term_assets: 60,
        current_liabilities: 30,
        long_term_liabilities: 40,
      },
    ])
  })

  it.each(['total_assets', 'current_assets', 'total_liabilities', 'current_liabilities'])(
    'skips a year without %s',
    (missing) => {
      const balance = { ...full }
      delete balance[missing]

      expect(balanceRows([year(2025, balance)])).toEqual([])
    },
  )

  it('skips a bank-shaped year with no current assets', () => {
    const bank = { total_assets: 100, total_liabilities: 90 }

    expect(balanceRows([year(2025, bank), year(2024, full)]).map((row) => row.label)).toEqual(['FY 2024'])
  })

  it('drops a year whose derived figure is negative', () => {
    const odd = { ...full, current_assets: 120 }

    expect(balanceRows([year(2025, odd)])).toEqual([])
  })

  it('keeps zero long-term figures', () => {
    const rows = balanceRows([year(2025, { ...full, total_assets: 40, total_liabilities: 30 })])

    expect(rows[0].long_term_assets).toBe(0)
    expect(rows[0].long_term_liabilities).toBe(0)
  })

  it('keeps the newest ten years in order', () => {
    const annual = Array.from({ length: 12 }, (_, i) => year(2014 + i, full))

    const rows = balanceRows(annual)

    expect(rows).toHaveLength(10)
    expect(rows[0].label).toBe('FY 2016')
  })

  it('answers an empty list for undefined', () => {
    expect(balanceRows(undefined)).toEqual([])
  })
})
