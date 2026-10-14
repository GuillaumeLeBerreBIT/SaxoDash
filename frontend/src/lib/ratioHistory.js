import { fmtMonthYear, fmtNum, fmtPct } from './format'

export const RATIO_GROUPS = [
  {
    key: 'valuation',
    label: 'Valuation',
    ratios: [
      { key: 'pe', label: 'P/E', format: 'num', current: 'pe_ratio' },
      { key: 'ps', label: 'P/S', format: 'num', current: 'ps_ratio' },
      { key: 'pb', label: 'P/B', format: 'num', current: 'pb_ratio' },
      { key: 'ev_ebitda', label: 'EV/EBITDA', format: 'num', current: 'ev_ebitda' },
      { key: 'pfcf', label: 'P/FCF', format: 'num' },
    ],
  },
  {
    key: 'profitability',
    label: 'Profitability',
    ratios: [
      { key: 'gross_margin', label: 'Gross margin', format: 'pct', current: 'gross_margin' },
      { key: 'operating_margin', label: 'Operating margin', format: 'pct', current: 'operating_margin_ttm' },
      { key: 'net_margin', label: 'Net margin', format: 'pct', current: 'net_margin' },
      { key: 'roe', label: 'ROE', format: 'pct', current: 'roe' },
      { key: 'roa', label: 'ROA', format: 'pct', current: 'roa' },
      { key: 'roic', label: 'ROIC', format: 'pct' },
    ],
  },
  {
    key: 'liquidity',
    label: 'Liquidity',
    ratios: [
      { key: 'current_ratio', label: 'Current ratio', format: 'num', current: 'current_ratio' },
      { key: 'quick_ratio', label: 'Quick ratio', format: 'num', current: 'quick_ratio' },
      { key: 'cash_ratio', label: 'Cash ratio', format: 'num' },
    ],
  },
  {
    key: 'solvency',
    label: 'Solvency',
    ratios: [
      { key: 'debt_to_equity', label: 'Debt / equity', format: 'num', current: 'debt_to_equity' },
      { key: 'debt_to_assets', label: 'Debt / assets', format: 'num' },
      { key: 'long_term_debt_to_equity', label: 'Long-term debt / equity', format: 'num', current: 'long_term_debt_to_equity' },
    ],
  },
]

export function fmtRatio(value, format) {
  return format === 'pct' ? fmtPct(value, { sign: false }) : fmtNum(value, 2)
}

export function ratiosWithHistory(history) {
  const points = history ?? []
  return RATIO_GROUPS.flatMap((group) => group.ratios).filter((ratio) => points.some((point) => point[ratio.key] != null))
}

export function periodLabels(history) {
  const points = history ?? []
  const counts = new Map()
  points.forEach((point) => {
    const year = point.period.slice(0, 4)
    counts.set(year, (counts.get(year) ?? 0) + 1)
  })
  return points.map((point) => {
    const year = point.period.slice(0, 4)
    return counts.get(year) > 1 ? fmtMonthYear(point.period) : `FY ${year}`
  })
}
