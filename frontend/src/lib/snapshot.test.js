import { describe, expect, it } from 'vitest'
import {
  SNAPSHOT_GROUPS, T, growthVerdict, profitabilityVerdict, healthVerdict, valuationVerdict, momentumVerdict,
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
  it('describes PEG without colouring a low one good or a high one bad, since PEG was never tested', () => {
    for (const peg of [0.8, 1.5, 2.4]) expect(valuationVerdict({ peg_ratio: peg }).tone).toBe('neutral')
    const f = { pe_ratio: 10, valuation_history: { pe: { min: 15, median: 25, max: 30, n: 6 } } }
    expect(valuationVerdict(f).tone).toBe('neutral')
  })
  it('reads P/E against its own history', () => {
    const v = valuationVerdict({ pe_ratio: 40, valuation_history: { pe: { min: 15, median: 25, max: 30, n: 6 } } })
    expect(v.text).toMatch(/above its 6-yr range/)
  })
  it('starts every pill with a capital letter', () => {
    expect(valuationVerdict({ peg_ratio: 0.8 }).text).toBe('PEG below 1')
    expect(valuationVerdict({ peg_ratio: 2.4 }).text).toBe('PEG above 2')
    expect(valuationVerdict({ peg_ratio: 1.5 }).text).toBe('PEG between 1 and 2')
  })
  it.each([
    ['cheap', 'Lower part of usual range'],
    ['fair', 'Middle'],
    ['expensive', 'Upper part'],
  ])('takes the P/E phrase from a %s verdict, so the page gives one valuation answer', (grade, phrase) => {
    const f = { peg_ratio: 1.5, pe_ratio: 40, valuation_history: { pe: { min: 15, median: 25, max: 30, n: 6 } } }
    expect(valuationVerdict(f, grade).text).toBe(`PEG between 1 and 2; ${phrase}`)
  })
  it('keeps its own P/E phrase when the verdict did not judge the valuation', () => {
    const f = { pe_ratio: 40, valuation_history: { pe: { min: 15, median: 25, max: 30, n: 6 } } }
    expect(valuationVerdict(f, 'not_judged').text).toBe('P/E above its 6-yr range')
  })
  it('describes the verdict P/E against its own history without colouring it good or bad', () => {
    expect(valuationVerdict({ pe_ratio: 20 }, 'expensive')).toEqual({ tone: 'neutral', text: 'Upper part' })
    expect(valuationVerdict({ pe_ratio: 20 }, 'cheap')).toEqual({ tone: 'neutral', text: 'Lower part of usual range' })
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

describe('snapshot metric formats', () => {
  const format = (field) => SNAPSHOT_GROUPS.flatMap((group) => group.metrics).find((m) => m.field === field).fmt
  it('marks ratios that are multiples, and interest coverage as a whole multiple', () => {
    expect(['current_ratio', 'debt_to_equity', 'quick_ratio', 'pe_ratio', 'forward_pe', 'ev_ebitda'].map(format)).toEqual(Array(6).fill('times'))
    expect(format('interest_coverage')).toBe('wholeTimes')
    expect(format('price_return_1y')).toBe('move')
    expect(format('beta')).toBe('num')
  })
})

describe('quality thresholds', () => {
  it('shares its quality thresholds with the nightly verdict engine (backend/verdicts/test_rules.py)', () => {
    expect([T.roeStrong, T.marginStrong, T.deLow, T.revSteady]).toEqual([15, 10, 1, 5])
  })
})
