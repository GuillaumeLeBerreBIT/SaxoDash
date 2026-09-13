import { describe, expect, it } from 'vitest'

import { qualityScore, quadrantPoint, valuationScore } from './quadrant'

describe('qualityScore', () => {
  it('is null without any of the three inputs', () => {
    expect(qualityScore({})).toBeNull()
  })

  it('rewards strong ROE, strong margins and low leverage', () => {
    const strong = qualityScore({ roe: 30, net_margin: 25, debt_to_equity: 0.2 })
    const weak = qualityScore({ roe: 2, net_margin: 1, debt_to_equity: 3 })
    expect(strong).toBeGreaterThan(weak)
  })

  it('averages whichever inputs are present', () => {
    expect(qualityScore({ roe: 15 })).toBe(100) // roe at the strong threshold caps its own band at 100
  })
})

describe('valuationScore', () => {
  it('is null without a PEG or valuation history', () => {
    expect(valuationScore({})).toBeNull()
  })

  it('reads a rich PEG as pricier than a cheap one', () => {
    expect(valuationScore({ peg_ratio: 3 })).toBeGreaterThan(valuationScore({ peg_ratio: 0.5 }))
  })

  it('nudges up when P/E sits above its own multi-year history', () => {
    const withHistoryAbove = valuationScore({
      peg_ratio: 1.5,
      pe_ratio: 40,
      valuation_history: { pe: { median: 20, n: 5 } },
    })
    const withoutHistory = valuationScore({ peg_ratio: 1.5 })
    expect(withHistoryAbove).toBeGreaterThan(withoutHistory)
  })
})

describe('quadrantPoint', () => {
  it('is null when either axis cannot be scored', () => {
    expect(quadrantPoint('AAPL', {})).toBeNull()
  })

  it('carries the symbol and isSelf flag through when both scores exist', () => {
    const point = quadrantPoint('AAPL', { roe: 20, net_margin: 20, debt_to_equity: 0.5, peg_ratio: 1.2 }, true)
    expect(point).toMatchObject({ symbol: 'AAPL', isSelf: true })
    expect(point.quality).toBeGreaterThan(0)
    expect(point.valuation).toBeGreaterThan(0)
  })
})
