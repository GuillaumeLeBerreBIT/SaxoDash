import { UNKNOWN, fmtCompact, fmtNum, fmtShares } from './format'

export const STATEMENTS = [
  {
    key: 'income',
    label: 'Income statement',
    rows: [
      { key: 'revenue', label: 'Revenue', headline: true },
      { key: 'cost_of_revenue', label: 'Cost of revenue' },
      { key: 'gross_profit', label: 'Gross profit', headline: true },
      { key: 'research_development', label: 'Research & development' },
      { key: 'selling_general_admin', label: 'Selling, general & admin' },
      { key: 'operating_income', label: 'Operating income', headline: true },
      { key: 'pretax_income', label: 'Pretax income' },
      { key: 'income_tax', label: 'Income tax' },
      { key: 'net_income', label: 'Net income', headline: true },
      { key: 'eps_diluted', label: 'Diluted EPS', format: 'perShare' },
      { key: 'diluted_shares', label: 'Diluted shares', format: 'shares' },
    ],
  },
  {
    key: 'balance',
    label: 'Balance sheet',
    rows: [
      { key: 'cash', label: 'Cash & equivalents' },
      { key: 'short_term_investments', label: 'Short-term investments' },
      { key: 'receivables', label: 'Receivables' },
      { key: 'inventory', label: 'Inventory' },
      { key: 'current_assets', label: 'Current assets' },
      { key: 'property_plant_equipment', label: 'Property, plant & equipment' },
      { key: 'goodwill', label: 'Goodwill' },
      { key: 'total_assets', label: 'Total assets', headline: true },
      { key: 'accounts_payable', label: 'Accounts payable' },
      { key: 'current_liabilities', label: 'Current liabilities' },
      { key: 'long_term_debt', label: 'Long-term debt' },
      { key: 'total_debt', label: 'Total debt' },
      { key: 'total_liabilities', label: 'Total liabilities', headline: true },
      { key: 'equity', label: 'Shareholders’ equity', headline: true },
    ],
  },
  {
    key: 'cash_flow',
    label: 'Cash flow',
    rows: [
      { key: 'operating_cash_flow', label: 'Operating cash flow', headline: true },
      { key: 'capital_expenditure', label: 'Capital expenditure' },
      { key: 'free_cash_flow', label: 'Free cash flow', headline: true },
      { key: 'depreciation_amortization', label: 'Depreciation & amortization' },
      { key: 'stock_based_compensation', label: 'Stock-based compensation' },
      { key: 'investing_cash_flow', label: 'Investing cash flow' },
      { key: 'financing_cash_flow', label: 'Financing cash flow' },
      { key: 'dividends_paid', label: 'Dividends paid' },
      { key: 'share_repurchases', label: 'Share repurchases' },
    ],
  },
]

export const statementByKey = (key) => STATEMENTS.find((statement) => statement.key === key) ?? STATEMENTS[0]

export const latestPeriods = (periods, count) => (periods ?? []).slice(-count)

export function rowsWithData(statement, periods) {
  return statement.rows.filter((row) => periods.some((period) => period[statement.key]?.[row.key] != null))
}

export function priorYearPeriod(periods, period) {
  const sameQuarter = (candidate) => (candidate.quarter ?? 0) === (period.quarter ?? 0)
  return periods.find((candidate) => candidate.fiscal_year === period.fiscal_year - 1 && sameQuarter(candidate)) ?? null
}

export function changePct(periods, period, statementKey, rowKey) {
  const current = period[statementKey]?.[rowKey]
  const prior = priorYearPeriod(periods, period)?.[statementKey]?.[rowKey]
  if (current == null || prior == null || prior === 0) return null
  return ((current - prior) / Math.abs(prior)) * 100
}

const MILLION = 1e6

export function fmtStatement(value, format) {
  if (value == null) return UNKNOWN
  if (format === 'perShare') return fmtNum(value, 2)
  if (format === 'shares') return fmtShares(value)
  return fmtCompact(value / MILLION)
}

export const CHART_SERIES = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'gross_profit', label: 'Gross profit' },
  { key: 'operating_income', label: 'Operating income' },
  { key: 'net_income', label: 'Net income' },
]

export function chartRows(periods) {
  return periods
    .map((period) => {
      const row = { label: period.label }
      for (const { key } of CHART_SERIES) {
        if (period.income?.[key] != null) row[key] = period.income[key]
      }
      return row
    })
    .filter((row) => Object.keys(row).length > 1)
}

export function waterfallSteps(period) {
  const income = period?.income ?? {}
  if (income.revenue == null || income.net_income == null) return []

  const steps = [{ key: 'revenue', label: 'Revenue', kind: 'total', from: 0, to: income.revenue }]
  let level = income.revenue
  const moveTo = (key, label, to) => {
    steps.push({ key, label, kind: 'change', from: level, to })
    level = to
  }
  const subtotal = (key, label) => steps.push({ key, label, kind: 'total', from: 0, to: level })

  if (income.gross_profit != null) {
    moveTo('cost_of_revenue', 'Cost of revenue', income.gross_profit)
    subtotal('gross_profit', 'Gross profit')
  }
  if (income.operating_income != null) {
    moveTo('operating_expenses', 'Operating expenses', income.operating_income)
    subtotal('operating_income', 'Operating income')
  }
  moveTo('tax_and_other', 'Tax & other', income.net_income)
  subtotal('net_income', 'Net income')
  return steps
}
