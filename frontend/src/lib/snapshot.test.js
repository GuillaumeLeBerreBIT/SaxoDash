import { describe, expect, it } from 'vitest'
import {
  growthVerdict, profitabilityVerdict, healthVerdict, valuationVerdict, momentumVerdict,
} from './snapshot'

describe('growthVerdict', () => {
  it('flags fast growth', () => {
    expect(growthVerdict({ revenue_growth_ttm_yoy: 22 }).tone).toBe('pos')
  })
  it('flags contraction', () => {
    expect(growthVerdict({ revenue_growth_ttm_yoy: -4 }).tone).toBe('caution')
  })
  it('notes EPS outpacing revenue', () => {
    expect(growthVerdict({ revenue_growth_ttm_yoy: 10, eps_growth_ttm_yoy: 20 }).text)
      .toMatch(/EPS outpacing revenue/)
  })
  it('is Limited data when nothing is present', () => {
    expect(growthVerdict({})).toEqual({ tone: 'neutral', text: 'Limited data' })
  })
})

describe('profitabilityVerdict', () => {
  it('calls high ROE + margin highly profitable', () => {
    expect(profitabilityVerdict({ roe: 25, net_margin: 15 }).tone).toBe('pos')
  })
  it('flags thin margins', () => {
    expect(profitabilityVerdict({ roe: 2, net_margin: 1 }).tone).toBe('caution')
  })
})

describe('healthVerdict', () => {
  it('flags leverage', () => {
    expect(healthVerdict({ debt_to_equity: 3, current_ratio: 0.8 }).tone).toBe('caution')
  })
  it('praises a conservative balance sheet', () => {
    expect(healthVerdict({ debt_to_equity: 0.4, current_ratio: 2 }).tone).toBe('pos')
  })
})

describe('valuationVerdict', () => {
  it('calls a low PEG cheap for the growth', () => {
    expect(valuationVerdict({ peg_ratio: 0.8 }).tone).toBe('pos')
  })
  it('reads P/E against its own history', () => {
    const v = valuationVerdict({ pe_ratio: 40, valuation_history: { pe: { min: 15, median: 25, max: 30, n: 6 } } })
    expect(v.text).toMatch(/above its 6-yr range/)
  })
})

describe('momentumVerdict', () => {
  it('flags a year of losses', () => {
    expect(momentumVerdict({ price_return_1y: -20 }).tone).toBe('caution')
  })
  it('notes YTD lag', () => {
    expect(momentumVerdict({ price_return_1y: 15, price_return_ytd: -3 }).text).toMatch(/lagging YTD/)
  })
})
