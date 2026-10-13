import { describe, expect, it } from 'vitest'

import { RATIO_GROUPS, fmtRatio, ratiosWithHistory } from './ratioHistory'

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
