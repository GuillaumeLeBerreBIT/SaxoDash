import { describe, expect, it } from 'vitest'
import { FLAT_FILL, NEGATIVE, PERFORMANCE_CAPS, POSITIVE, colorForCategory, paddedDomain, performanceFill, seriesAxis, withAlpha } from './charts'

describe('colorForCategory', () => {
  it('gives TRANSFER and SAVINGS a distinct neutral color, not a budgetable category color', () => {
    const transfer = colorForCategory('TRANSFER')
    const savings = colorForCategory('SAVINGS')
    const groceries = colorForCategory('GROCERIES')
    expect(transfer).not.toBe(groceries)
    expect(savings).not.toBe(groceries)
    expect(transfer).toBe(savings)
  })

  it('gives an unknown category the same neutral fallback, not GROCERIES colour', () => {
    const unknown = colorForCategory('SOME_FUTURE_CATEGORY')
    const groceries = colorForCategory('GROCERIES')
    expect(unknown).not.toBe(groceries)
  })

  it('still gives every real budgetable category its own distinct color', () => {
    const codes = ['GROCERIES', 'DINING', 'TRANSPORT', 'UTILITIES', 'SUBSCRIPTIONS', 'SHOPPING', 'HEALTH', 'TRAVEL', 'ENTERTAINMENT', 'OTHER']
    const colors = codes.map(colorForCategory)
    expect(new Set(colors).size).toBe(codes.length)
  })
})

describe('performanceFill', () => {
  it('has no fill for an unknown move', () => {
    expect(performanceFill(null, { cap: 3 })).toBeNull()
    expect(performanceFill(undefined, { cap: 3 })).toBeNull()
  })

  it('reads a move inside the flat band as flat, not as a faint gain or loss', () => {
    expect(performanceFill(0, { cap: 3 })).toBe(FLAT_FILL)
    expect(performanceFill(-0.05, { cap: 3 })).toBe(FLAT_FILL)
  })

  it('tints gains green and losses red in proportion to the cap', () => {
    expect(performanceFill(1.5, { cap: 3 })).toBe(withAlpha(POSITIVE, 0.12 + 0.5 * 0.65))
    expect(performanceFill(-1.5, { cap: 3 })).toBe(withAlpha(NEGATIVE, 0.12 + 0.5 * 0.65))
  })

  it('saturates at the cap', () => {
    expect(performanceFill(12, { cap: 3 })).toBe(performanceFill(3, { cap: 3 }))
  })

  it('accepts the numeric strings the API sends', () => {
    expect(performanceFill('1.5', { cap: 3 })).toBe(performanceFill(1.5, { cap: 3 }))
  })

  it('keeps the monthly scale unchanged when the flat band is off', () => {
    expect(performanceFill(0, { cap: PERFORMANCE_CAPS.month, flat: 0 })).toBe(withAlpha(POSITIVE, 0.12))
  })
})

describe('paddedDomain', () => {
  it('leaves headroom around the data instead of starting at zero', () => {
    const [low, high] = paddedDomain([31000, 32000])
    expect(low).toBeLessThan(31000)
    expect(low).toBeGreaterThan(30000)
    expect(high).toBeGreaterThan(32000)
    expect(high).toBeLessThan(33000)
  })

  it('gives a flat series a visible span', () => {
    const [low, high] = paddedDomain([5000, 5000])
    expect(high - low).toBeGreaterThan(0)
    expect(low).toBeLessThan(5000)
    expect(high).toBeGreaterThan(5000)
  })

  it('handles a series of zeros', () => {
    const [low, high] = paddedDomain([0, 0])
    expect(high).toBeGreaterThan(low)
  })

  it('never pads a non-negative series below zero', () => {
    const [low, high] = paddedDomain([0, 1000])
    expect(low).toBe(0)
    expect(high).toBeGreaterThan(1000)
  })

  it('keeps an all-zero series at a zero floor with a non-zero span', () => {
    const [low, high] = paddedDomain([0, 0])
    expect(low).toBe(0)
    expect(high).toBeGreaterThan(0)
  })
})

describe('seriesAxis', () => {
  it('rounds history-chart money ticks over the chosen series only', () => {
    const rows = [
      { net_worth: 48210.5, bank_total: 12340.2 },
      { net_worth: 51873.9, bank_total: 9120.8 },
    ]
    const { ticks, domain } = seriesAxis(rows, ['net_worth'])
    expect(ticks.every((t) => t % 1000 === 0)).toBe(true)
    expect(domain).toEqual([ticks[0], ticks[ticks.length - 1]])
    expect(domain[0]).toBeLessThanOrEqual(48210.5)
    expect(domain[1]).toBeGreaterThanOrEqual(51873.9)
  })

  it('anchors spending bars at zero', () => {
    const { domain } = seriesAxis([{ total: 412.7 }, { total: 389.1 }], ['total'], { includeZero: true })
    expect(domain[0]).toBe(0)
    expect(domain[1]).toBeGreaterThanOrEqual(412.7)
  })

  it('rounds percent ticks for return bars', () => {
    const { ticks } = seriesAxis(
      [{ portfolio_pct: -7.3, benchmark_pct: 14.82 }, { portfolio_pct: 21.4, benchmark_pct: 9.1 }],
      ['portfolio_pct', 'benchmark_pct'],
      { includeZero: true },
    )
    expect(ticks).toEqual([-10, 0, 10, 20, 30])
  })

  it('gives no props when nothing is plottable', () => {
    expect(seriesAxis([{ a: null }], ['a'])).toEqual({})
  })

  it('falls back to the padded domain for a flat series', () => {
    const axis = seriesAxis([{ a: 100 }, { a: 100 }], ['a'])
    expect(axis).not.toHaveProperty('ticks')
    expect(axis.domain).toEqual(paddedDomain([100, 100]))
  })

  it('falls back to the padded domain for a single point', () => {
    const axis = seriesAxis([{ a: 250 }], ['a'])
    expect(axis).not.toHaveProperty('ticks')
    expect(axis.domain).toEqual(paddedDomain([250, 250]))
  })

  it('falls back to the padded domain for an all-zero drawdown', () => {
    const axis = seriesAxis([{ dd: 0 }, { dd: 0 }], ['dd'], { includeZero: true })
    expect(axis).not.toHaveProperty('ticks')
    expect(axis.domain).toEqual(paddedDomain([0, 0]))
  })
})
