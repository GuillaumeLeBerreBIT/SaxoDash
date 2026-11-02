import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE } from './theme'
import { PERFORMANCE_CAPS, chartPalette, colorForCategory, colorForRank, colorForTicker, performanceFill, seriesAxis, statementSeries, surpriseColor, withAlpha } from './charts'

const palette = chartPalette(DEFAULT_APPEARANCE)

describe('colorForCategory', () => {
  it('gives TRANSFER and SAVINGS a distinct neutral color, not a budgetable category color', () => {
    const transfer = colorForCategory('TRANSFER', palette)
    const savings = colorForCategory('SAVINGS', palette)
    const groceries = colorForCategory('GROCERIES', palette)
    expect(transfer).not.toBe(groceries)
    expect(savings).not.toBe(groceries)
    expect(transfer).toBe(savings)
  })

  it('gives an unknown category the same neutral fallback, not GROCERIES colour', () => {
    const unknown = colorForCategory('SOME_FUTURE_CATEGORY', palette)
    const groceries = colorForCategory('GROCERIES', palette)
    expect(unknown).not.toBe(groceries)
  })

  it('still gives every real budgetable category its own distinct color', () => {
    const codes = ['GROCERIES', 'DINING', 'TRANSPORT', 'UTILITIES', 'SUBSCRIPTIONS', 'SHOPPING', 'HEALTH', 'TRAVEL', 'ENTERTAINMENT', 'OTHER']
    const colors = codes.map((code) => colorForCategory(code, palette))
    expect(new Set(colors).size).toBe(codes.length)
  })

  it('draws categories from the active palette when given one', () => {
    const c = chartPalette({ theme: 'republic', moves: 'green-red' })
    const codes = ['GROCERIES', 'DINING', 'TRANSPORT', 'UTILITIES', 'SUBSCRIPTIONS', 'SHOPPING', 'HEALTH', 'TRAVEL', 'ENTERTAINMENT', 'OTHER']
    const colors = codes.map((code) => colorForCategory(code, c))
    expect(colors[0]).toBe(c.series[0])
    expect(new Set(colors).size).toBe(codes.length)
    expect(colorForCategory('TRANSFER', c)).toBe(c.axis)
    expect(colorForCategory('SOME_FUTURE_CATEGORY', c)).toBe(c.axis)
  })
})

describe('performanceFill', () => {
  it('has no fill for an unknown move', () => {
    expect(performanceFill(null, { cap: 3 }, palette)).toBeNull()
    expect(performanceFill(undefined, { cap: 3 }, palette)).toBeNull()
  })

  it('reads a move inside the flat band as flat, not as a faint gain or loss', () => {
    expect(performanceFill(0, { cap: 3 }, palette)).toBe(withAlpha(palette.flat, 0.18))
    expect(performanceFill(-0.05, { cap: 3 }, palette)).toBe(withAlpha(palette.flat, 0.18))
  })

  it('tints gains green and losses red in proportion to the cap', () => {
    expect(performanceFill(1.5, { cap: 3 }, palette)).toBe(withAlpha(palette.up, 0.12 + 0.5 * 0.65))
    expect(performanceFill(-1.5, { cap: 3 }, palette)).toBe(withAlpha(palette.down, 0.12 + 0.5 * 0.65))
  })

  it('saturates at the cap', () => {
    expect(performanceFill(12, { cap: 3 }, palette)).toBe(performanceFill(3, { cap: 3 }, palette))
  })

  it('accepts the numeric strings the API sends', () => {
    expect(performanceFill('1.5', { cap: 3 }, palette)).toBe(performanceFill(1.5, { cap: 3 }, palette))
  })

  it('keeps the monthly scale unchanged when the flat band is off', () => {
    expect(performanceFill(0, { cap: PERFORMANCE_CAPS.month, flat: 0 }, palette)).toBe(withAlpha(palette.up, 0.12))
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
    expect(axis.domain).toEqual([99, 101])
  })

  it('falls back to the padded domain for a single point', () => {
    const axis = seriesAxis([{ a: 250 }], ['a'])
    expect(axis).not.toHaveProperty('ticks')
    expect(axis.domain).toEqual([247.5, 252.5])
  })

  it('falls back to the padded domain for an all-zero drawdown', () => {
    const axis = seriesAxis([{ dd: 0 }, { dd: 0 }], ['dd'], { includeZero: true })
    expect(axis).not.toHaveProperty('ticks')
    expect(axis.domain).toEqual([0, 1])
  })

  it('reads string decimals the way the API sends them', () => {
    const rows = [{ net_worth: '100000.00' }, { net_worth: '102500.50' }, { net_worth: '105000.00' }]
    const { ticks, domain } = seriesAxis(rows, ['net_worth'])
    expect(ticks.length).toBeGreaterThan(1)
    expect(domain[0]).toBeGreaterThan(0)
    expect(domain[0]).toBeLessThanOrEqual(100000)
    expect(domain[1]).toBeGreaterThanOrEqual(105000)
  })

  it('pads a flat string-decimal series without anchoring at zero', () => {
    const axis = seriesAxis([{ a: '100000.00' }, { a: '100000.00' }], ['a'])
    expect(axis).not.toHaveProperty('ticks')
    expect(axis.domain[0]).toBeGreaterThan(90000)
    expect(axis.domain[1]).toBeGreaterThan(100000)
  })

  it('ignores null, undefined and empty-string rows rather than reading them as zero', () => {
    const rows = [{ a: null }, { a: '' }, {}, { a: '100000.00' }, { a: '105000.00' }]
    const { domain } = seriesAxis(rows, ['a'])
    expect(domain[0]).toBeGreaterThan(0)
    expect(seriesAxis([{ a: '' }, { a: null }, {}], ['a'])).toEqual({})
  })
})

describe('surpriseColor', () => {
  it('colours a beat up, a miss down and an unjudged report as an estimate', () => {
    expect(surpriseColor(0.4, palette)).toBe(palette.up)
    expect(surpriseColor(-0.4, palette)).toBe(palette.down)
    expect(surpriseColor(null, palette)).toBe(palette.estimate)
  })
})

describe('statementSeries', () => {
  it('names each statement line by a series colour of the active theme', () => {
    const light = chartPalette({ theme: 'light', moves: 'green-red' })
    expect(statementSeries(light)).toEqual({
      revenue: light.series[0],
      gross_profit: light.series[1],
      operating_income: light.series[3],
      net_income: light.series[2],
    })
  })
})

describe('colorForTicker and colorForRank', () => {
  it('pick from the active series palette', () => {
    expect(palette.series).toContain(colorForTicker('AAPL', palette))
    expect(colorForTicker('AAPL', palette)).toBe(colorForTicker('AAPL', palette))
    expect(colorForRank(9, palette)).toBe(palette.series[1])
  })
})

describe('chartPalette', () => {
  it('maps roles from the active theme', () => {
    const c = chartPalette({ theme: 'republic', moves: 'green-red' })
    expect(c.up).toBe('#5BC860')
    expect(c.series[0]).toBe('#3987e5')
    expect(c.series).toHaveLength(8)
    expect(c.heat).toHaveLength(7)
    expect(c.tooltip).toEqual({ bg: '#1A1A1A', text: '#FFFFFF', border: '#1A1A1A' })
  })

  it('names Ink for a highlighted mark such as the current period', () => {
    expect(chartPalette({ theme: 'republic', moves: 'green-red' }).ink).toBe('#FFFFFF')
  })

  it('uses the colour-blind pair for moves', () => {
    expect(chartPalette({ theme: 'republic', moves: 'cvd' }).down).toBe('#FF9A3C')
  })

  it('tints performance fills with the palette when given one', () => {
    const c = chartPalette({ theme: 'blue', moves: 'green-red' })
    expect(performanceFill(1.5, { cap: 3 }, c)).toBe(withAlpha(c.up, 0.12 + 0.5 * 0.65))
  })
})
