import { describe, expect, it } from 'vitest'

import { fmtMonthYear } from './format'
import { RATIO_GROUPS, fmtRatio, periodLabels, ratiosWithHistory } from './ratioHistory'

describe('RATIO_GROUPS', () => {
  it('groups the ratios the way the table reads', () => {
    expect(RATIO_GROUPS.map((group) => group.label)).toEqual(['Valuation', 'Profitability', 'Liquidity', 'Solvency'])
  })

  it('names where each current figure comes from', () => {
    const byKey = Object.fromEntries(RATIO_GROUPS.flatMap((group) => group.ratios).map((ratio) => [ratio.key, ratio]))
    expect(byKey.pe.current).toBe('pe_ratio')
    expect(byKey.operating_margin.current).toBe('operating_margin_ttm')
    expect(byKey.roic.current).toBeUndefined()
  })
})

describe('fmtRatio', () => {
  it('prints a multiple with two decimals and a percentage without a sign', () => {
    expect(fmtRatio(33.557, 'num')).toBe('33.56')
    expect(fmtRatio(46.91, 'pct')).toBe('46.91%')
  })

  it('prints a dash for a missing value', () => {
    expect(fmtRatio(null, 'num')).toBe('—')
  })
})

describe('ratiosWithHistory', () => {
  it('lists only ratios with at least one point', () => {
    const history = [{ period: '2024-12-31', pe: 20 }, { period: '2025-12-31', pe: 22, roe: 30 }]
    expect(ratiosWithHistory(history).map((ratio) => ratio.key)).toEqual(['pe', 'roe'])
  })

  it('is empty for a missing history', () => {
    expect(ratiosWithHistory(undefined)).toEqual([])
  })
})

describe('periodLabels', () => {
  it('uses the year when each year occurs once', () => {
    expect(periodLabels([{ period: '2023-09-30' }, { period: '2024-09-28' }])).toEqual(['FY 2023', 'FY 2024'])
  })

  it('uses month and year for every point whose year repeats', () => {
    const history = [{ period: '2023-12-31' }, { period: '2024-01-31' }, { period: '2024-12-31' }]
    expect(periodLabels(history)).toEqual(['FY 2023', fmtMonthYear('2024-01-31'), fmtMonthYear('2024-12-31')])
  })

  it('is empty for a missing or empty history', () => {
    expect(periodLabels(undefined)).toEqual([])
    expect(periodLabels([])).toEqual([])
  })
})
