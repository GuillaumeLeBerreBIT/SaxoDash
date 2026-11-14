import { describe, expect, it } from 'vitest'

import { averageTrueRange, fxRateFor, tradePlan } from './tradePlan'

const bar = (high, low, close) => ({ high, low, close })

describe('averageTrueRange', () => {
  it('is the Wilder average of each day\'s true range', () => {
    const bars = [bar(10, 9, 9.5), ...Array.from({ length: 14 }, () => bar(11, 9, 10))]
    expect(averageTrueRange(bars)).toBeCloseTo(2, 6)
  })

  it('smooths later ranges the Wilder way, not as a plain average', () => {
    const bars = [bar(10, 9, 10), bar(11, 9, 10), bar(11, 9, 10), bar(14, 10, 12), bar(20, 12, 16)]
    expect(averageTrueRange(bars, 2)).toBeCloseTo(5.5, 6)
  })

  it('counts a gap from the last close as range', () => {
    const bars = [bar(10, 9, 10), bar(13, 12, 12.5), bar(13, 12, 12.5)]
    expect(averageTrueRange(bars, 2)).toBeCloseTo(2, 6)
  })

  it('is null without enough bars', () => {
    expect(averageTrueRange([bar(10, 9, 9.5)])).toBeNull()
    expect(averageTrueRange([])).toBeNull()
  })
})

describe('fxRateFor', () => {
  const positions = [{ currency: 'USD', fx_rate: '0.92' }, { currency: 'GBP', fx_rate: '1.17' }]

  it('is one for the reporting currency and a held position\'s rate otherwise', () => {
    expect(fxRateFor('EUR', positions)).toBe(1)
    expect(fxRateFor('USD', positions)).toBe(0.92)
  })

  it('is null when nothing held is quoted in that currency', () => {
    expect(fxRateFor('JPY', positions)).toBeNull()
    expect(fxRateFor(undefined, positions)).toBeNull()
  })
})

describe('tradePlan', () => {
  const base = { price: 100, atr: 2.5, riskPct: 1, portfolioValue: 50000, fxRate: 1 }

  it('places the stop two average ranges below the price when you set none', () => {
    const plan = tradePlan(base)
    expect(plan.stop).toEqual({ price: 95, source: 'atr' })
    expect(plan.riskPerShare).toBe(5)
    expect(plan.stopDistancePct).toBeCloseTo(-5, 6)
    expect(plan.stopAtrs).toBeCloseTo(2, 6)
  })

  it('uses your own stop and target, and gives the reward for each unit of risk', () => {
    const plan = tradePlan({ ...base, stopPrice: 92, targetPrice: 124 })
    expect(plan.stop).toEqual({ price: 92, source: 'yours' })
    expect(plan.rewardToRisk).toBeCloseTo(3, 6)
    expect(plan.stopAtrs).toBeCloseTo(3.2, 6)
  })

  it('ignores a stop above the price and a target below it', () => {
    const plan = tradePlan({ ...base, stopPrice: 120, targetPrice: 80 })
    expect(plan.stop.source).toBe('atr')
    expect(plan.rewardToRisk).toBeNull()
  })

  it('sizes the position so a stop-out loses the chosen share of the portfolio', () => {
    const plan = tradePlan({ ...base, riskPct: 0.5 })
    expect(plan.size).toMatchObject({ shares: 50, value: 5000, lossAtStop: 250, limitedByCap: false })
    expect(plan.size.weightPct).toBeCloseTo(10, 6)
  })

  it('converts through the exchange rate', () => {
    const plan = tradePlan({ ...base, fxRate: 0.5, riskPct: 0.5 })
    expect(plan.size).toMatchObject({ shares: 100, value: 5000, lossAtStop: 250 })
  })

  it('never sizes past the weight cap, counting what you already hold', () => {
    const plan = tradePlan({ ...base, riskPct: 2, heldWeightPct: 9 })
    expect(plan.size).toMatchObject({ shares: 30, limitedByCap: true })
    expect(plan.size.weightPct).toBeCloseTo(6, 6)
    expect(tradePlan({ ...base, heldWeightPct: 20 }).size).toMatchObject({ shares: 0, limitedByCap: true })
  })

  it('gives no size without a portfolio value or an exchange rate, and no plan without a price or a stop', () => {
    expect(tradePlan({ ...base, portfolioValue: 0 }).size).toBeNull()
    expect(tradePlan({ ...base, fxRate: null }).size).toBeNull()
    expect(tradePlan({ ...base, price: null })).toBeNull()
    expect(tradePlan({ ...base, atr: null })).toBeNull()
    expect(tradePlan({ ...base, atr: 60 })).toBeNull()
  })
})
