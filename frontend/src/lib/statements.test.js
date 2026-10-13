import { describe, expect, it } from 'vitest'

import {
  CHART_SERIES,
  STATEMENTS,
  changePct,
  chartRows,
  fmtStatement,
  latestPeriods,
  priorYearPeriod,
  rowsWithData,
  statementByKey,
  waterfallSteps,
} from './statements'

const year = (fiscal_year, income, extra = {}) => ({
  period: `${fiscal_year}-12-31`,
  fiscal_year,
  label: `FY ${fiscal_year}`,
  income,
  balance: {},
  cash_flow: {},
  ...extra,
})

const quarter = (fiscal_year, q, income) => ({
  period: `${fiscal_year}-${String(q * 3).padStart(2, '0')}-28`,
  fiscal_year,
  quarter: q,
  label: `Q${q} ${fiscal_year}`,
  income,
  balance: {},
  cash_flow: {},
})

describe('STATEMENTS', () => {
  it('lists the three statements in reading order', () => {
    expect(STATEMENTS.map((statement) => statement.key)).toEqual(['income', 'balance', 'cash_flow'])
  })

  it('marks the headline income rows', () => {
    const headlines = statementByKey('income').rows.filter((row) => row.headline).map((row) => row.key)
    expect(headlines).toEqual(['revenue', 'gross_profit', 'operating_income', 'net_income'])
  })

  it('falls back to the income statement for an unknown key', () => {
    expect(statementByKey('nonsense').key).toBe('income')
  })
})

describe('latestPeriods', () => {
  it('keeps the newest periods, oldest first', () => {
    const periods = [year(2021, {}), year(2022, {}), year(2023, {})]
    expect(latestPeriods(periods, 2).map((p) => p.fiscal_year)).toEqual([2022, 2023])
  })

  it('returns an empty list for a missing input', () => {
    expect(latestPeriods(undefined, 5)).toEqual([])
  })
})

describe('rowsWithData', () => {
  it('drops a row no visible period reports', () => {
    const periods = [year(2024, { revenue: 10, net_income: 2 }), year(2025, { revenue: 12, net_income: 3 })]
    const keys = rowsWithData(statementByKey('income'), periods).map((row) => row.key)
    expect(keys).toEqual(['revenue', 'net_income'])
  })

  it('keeps a row reported in only one period', () => {
    const periods = [year(2024, { revenue: 10 }), year(2025, { revenue: 12, gross_profit: 5 })]
    expect(rowsWithData(statementByKey('income'), periods).map((row) => row.key)).toContain('gross_profit')
  })
})

describe('priorYearPeriod', () => {
  it('finds the previous fiscal year for an annual period', () => {
    const periods = [year(2024, {}), year(2025, {})]
    expect(priorYearPeriod(periods, periods[1])).toBe(periods[0])
  })

  it('finds the same quarter a fiscal year earlier', () => {
    const periods = [quarter(2026, 2, {}), quarter(2026, 3, {}), quarter(2027, 2, {})]
    expect(priorYearPeriod(periods, periods[2])).toBe(periods[0])
  })

  it('returns null when that period was never filed', () => {
    const periods = [quarter(2026, 3, {}), quarter(2027, 2, {})]
    expect(priorYearPeriod(periods, periods[1])).toBeNull()
  })
})

describe('changePct', () => {
  it('is the change from the prior year', () => {
    const periods = [year(2024, { revenue: 100 }), year(2025, { revenue: 125 })]
    expect(changePct(periods, periods[1], 'income', 'revenue')).toBeCloseTo(25)
  })

  it('divides by the size of a negative base', () => {
    const periods = [year(2024, { net_income: -50 }), year(2025, { net_income: 25 })]
    expect(changePct(periods, periods[1], 'income', 'net_income')).toBeCloseTo(150)
  })

  it('is null without a prior period, a prior value, or with a zero base', () => {
    const periods = [year(2024, { revenue: 0 }), year(2025, { revenue: 10, gross_profit: 4 })]
    expect(changePct(periods, periods[0], 'income', 'revenue')).toBeNull()
    expect(changePct(periods, periods[1], 'income', 'gross_profit')).toBeNull()
    expect(changePct(periods, periods[1], 'income', 'revenue')).toBeNull()
  })
})

describe('fmtStatement', () => {
  it('prints dollars compactly', () => {
    expect(fmtStatement(416_161_000_000)).toBe('416.16B')
    expect(fmtStatement(-1_500_000_000)).toBe('-1.50B')
    expect(fmtStatement(4_976_000_000_000)).toBe('4.98T')
  })

  it('moves a value that rounds up to 1000 of a unit to the next unit', () => {
    expect(fmtStatement(999_600_000)).toBe('999.60M')
    expect(fmtStatement(999_999_999)).toBe('1.00B')
  })

  it('prints millions, thousands and small figures without losing them', () => {
    expect(fmtStatement(4_900_000)).toBe('4.90M')
    expect(fmtStatement(250_000)).toBe('250.00K')
    expect(fmtStatement(-400_000)).toBe('-400.00K')
    expect(fmtStatement(950)).toBe('950')
    expect(fmtStatement(0)).toBe('0')
    expect(fmtStatement(-0)).toBe('0')
  })

  it('prints a dash for a missing value', () => {
    expect(fmtStatement(null)).toBe('—')
    expect(fmtStatement(undefined)).toBe('—')
  })
})

describe('chartRows', () => {
  it('carries the four headline series per period', () => {
    const rows = chartRows([year(2025, { revenue: 10, gross_profit: 6, operating_income: 3, net_income: 2, income_tax: 1 })])
    expect(rows).toEqual([{ label: 'FY 2025', revenue: 10, gross_profit: 6, operating_income: 3, net_income: 2 }])
  })

  it('leaves out a period with none of them', () => {
    expect(chartRows([year(2025, { income_tax: 1 })])).toEqual([])
  })

  it('names every charted series', () => {
    expect(CHART_SERIES.map((series) => series.key)).toEqual(['revenue', 'gross_profit', 'operating_income', 'net_income'])
  })
})

describe('waterfallSteps', () => {
  it('walks from revenue to net income through each subtotal', () => {
    const steps = waterfallSteps(year(2025, { revenue: 100, gross_profit: 60, operating_income: 35, net_income: 28 }))

    expect(steps.map((step) => [step.key, step.kind, step.from, step.to])).toEqual([
      ['revenue', 'total', 0, 100],
      ['cost_of_revenue', 'change', 100, 60],
      ['gross_profit', 'total', 0, 60],
      ['operating_expenses', 'change', 60, 35],
      ['operating_income', 'total', 0, 35],
      ['tax_and_other', 'change', 35, 28],
      ['net_income', 'total', 0, 28],
    ])
  })

  it('goes straight from revenue to net income for a company with no subtotals', () => {
    const steps = waterfallSteps(year(2025, { revenue: 100, net_income: 30 }))

    expect(steps.map((step) => step.key)).toEqual(['revenue', 'tax_and_other', 'net_income'])
    expect(steps[1]).toMatchObject({ from: 100, to: 30 })
  })

  it('names the last step by what it covers', () => {
    const lastChange = (income) => waterfallSteps(year(2025, income)).find((step) => step.key === 'tax_and_other').label

    expect(lastChange({ revenue: 100, gross_profit: 60, operating_income: 35, net_income: 28 })).toBe('Tax & other')
    expect(lastChange({ revenue: 100, gross_profit: 60, net_income: 28 })).toBe('Operating costs, tax & other')
    expect(lastChange({ revenue: 100, net_income: 28 })).toBe('Costs, tax & other')
  })

  it('handles a net loss', () => {
    const steps = waterfallSteps(year(2025, { revenue: 100, operating_income: -20, net_income: -25 }))

    expect(steps.at(-1)).toMatchObject({ key: 'net_income', from: 0, to: -25 })
  })

  it('is empty without revenue or net income', () => {
    expect(waterfallSteps(year(2025, { revenue: 100 }))).toEqual([])
    expect(waterfallSteps(year(2025, { net_income: 5 }))).toEqual([])
    expect(waterfallSteps(null)).toEqual([])
  })
})

describe('the income statement rows', () => {
  it('has no per-share rows', () => {
    const keys = statementByKey('income').rows.map((row) => row.key)

    expect(keys).not.toContain('eps_diluted')
    expect(keys).not.toContain('diluted_shares')
  })
})
