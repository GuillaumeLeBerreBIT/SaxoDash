import { describe, expect, it } from 'vitest'

import {
  MAX_Y_SCALE,
  MAX_Y_SHIFT,
  MIN_PRICE_HEIGHT,
  MIN_Y_SCALE,
  PAD_R,
  barCountFromDrag,
  barsFromDrag,
  donutOuterRadius,
  formatTimeLabel,
  indexFromPointer,
  shiftFromDrag,
  timeLabelStyle,
  linePath,
  paneGeometry,
  priceGeometry,
  pricePaneHeight,
  scaleFromDrag,
  svgY,
} from './chartGeometry'

const bars = [
  { high: 110, low: 90 },
  { high: 120, low: 100 },
  { high: 105, low: 95 },
]

const geometry = (overrides = {}) =>
  priceGeometry({ data: bars, ind: null, width: 462, height: 200, ...overrides })

describe('priceGeometry', () => {
  it('reserves the right-hand gutter for the price axis', () => {
    expect(geometry().chartW).toBe(462 - PAD_R)
  })

  it('centres each bar in its own slot', () => {
    const { xAt, slot } = geometry()

    expect(xAt(0)).toBeCloseTo(slot / 2)
    expect(xAt(1) - xAt(0)).toBeCloseTo(slot)
  })

  it('puts the highest price above the lowest on screen', () => {
    const { scaleY } = geometry()

    expect(scaleY(120)).toBeLessThan(scaleY(90))
  })

  it('pads the extremes so the outermost bars are not on the frame', () => {
    const { scaleY, chartH } = geometry()

    expect(scaleY(120)).toBeGreaterThan(0)
    expect(scaleY(90)).toBeLessThan(chartH)
  })

  it('stays drawable when every price is identical', () => {
    const flat = [{ high: 100, low: 100 }, { high: 100, low: 100 }]
    const { scaleY } = priceGeometry({ data: flat, ind: null, width: 462, height: 200 })

    expect(Number.isFinite(scaleY(100))).toBe(true)
  })

  it('widens the scale to fit the Bollinger bands when they are shown', () => {
    const ind = { bb: { up: [200], lo: [10] } }

    const without = geometry().ticks
    const withBands = geometry({ ind, withBands: true }).ticks

    expect(withBands[withBands.length - 1]).toBeGreaterThan(without[without.length - 1])
    expect(withBands[0]).toBeLessThan(without[0])
  })

  it('never collapses the plot below a usable width', () => {
    expect(priceGeometry({ data: bars, ind: null, width: 10, height: 200 }).chartW).toBe(80)
  })
})

describe('paneGeometry', () => {
  it('places bar i at the same x as the price pane, which is what keeps the crosshair honest', () => {
    const price = geometry()
    const pane = paneGeometry(462, bars.length)

    for (let i = 0; i < bars.length; i += 1) {
      expect(pane.xAt(i)).toBeCloseTo(price.xAt(i))
    }
    expect(pane.slot).toBeCloseTo(price.slot)
    expect(pane.barWidth).toBeCloseTo(price.candleWidth)
  })

  it('survives an empty dataset rather than dividing by zero', () => {
    expect(Number.isFinite(paneGeometry(462, 0).slot)).toBe(true)
  })
})

describe('linePath', () => {
  it('lifts the pen across a gap instead of drawing through it', () => {
    const d = linePath([1, null, 3], (i) => i * 10, (v) => v)

    expect(d).toBe('M0.00 1.00 M20.00 3.00')
  })

  it('joins consecutive values', () => {
    expect(linePath([1, 2], (i) => i * 10, (v) => v)).toBe('M0.00 1.00 L10.00 2.00')
  })

  it('draws nothing from an all-null series', () => {
    expect(linePath([null, null], (i) => i, (v) => v)).toBe('')
  })
})

describe('indexFromPointer', () => {
  const event = (clientX) => ({
    clientX,
    currentTarget: { getBoundingClientRect: () => ({ left: 0 }) },
  })

  it('maps a pointer to the bar under it', () => {
    expect(indexFromPointer(event(25), 10, 5)).toBe(2)
  })

  it('clamps past either end of the dataset', () => {
    expect(indexFromPointer(event(-40), 10, 5)).toBe(0)
    expect(indexFromPointer(event(9999), 10, 5)).toBe(4)
  })
})

describe('donutOuterRadius', () => {
  it('uses the full ring when the container has room for it', () => {
    expect(donutOuterRadius(600, 8)).toBe(112)
  })

  it('shrinks the ring to fit a narrow container instead of clipping it', () => {
    expect(donutOuterRadius(200, 8)).toBe(92)
  })

  it('reserves room for labels drawn outside the ring', () => {
    expect(donutOuterRadius(300, 64)).toBe(86)
  })

  it('never shrinks below the smallest readable ring', () => {
    expect(donutOuterRadius(80, 8)).toBe(56)
  })
})

describe('price scale', () => {
  it('maps a price to y and back', () => {
    const { scaleY, priceAtY } = geometry()

    expect(priceAtY(scaleY(107.5))).toBeCloseTo(107.5)
  })

  it('keeps the automatic domain when the scale is 1', () => {
    const { top, bottom } = geometry()

    expect(top).toBeCloseTo(120 + 30 * 0.07)
    expect(bottom).toBeCloseTo(90 - 30 * 0.07)
  })

  it('widens the domain around the same midpoint when compressed', () => {
    const base = geometry()
    const wide = geometry({ yScale: 2 })

    expect((wide.top + wide.bottom) / 2).toBeCloseTo((base.top + base.bottom) / 2)
    expect(wide.top - wide.bottom).toBeCloseTo(2 * (base.top - base.bottom))
  })

  it('narrows the domain when stretched', () => {
    const base = geometry()
    const narrow = geometry({ yScale: 0.5 })

    expect(narrow.top - narrow.bottom).toBeCloseTo((base.top - base.bottom) / 2)
  })

  it('puts the ticks on the scaled domain', () => {
    const { ticks, top, bottom } = geometry({ yScale: 3 })

    expect(ticks[0]).toBeCloseTo(bottom)
    expect(ticks[ticks.length - 1]).toBeCloseTo(top)
  })
})

describe('svgY', () => {
  it('converts a pointer event to an svg-local y', () => {
    const event = {
      clientY: 130,
      currentTarget: {
        closest: () => ({ getBoundingClientRect: () => ({ top: 100 }) }),
      },
    }

    expect(svgY(event)).toBe(30)
  })
})

describe('pricePaneHeight', () => {
  const paneHeights = { volume: 96, rsi: 120, macd: 120 }
  const none = { volume: false, rsi: false, macd: false }

  it('gives the price pane everything but the legend, time axis and padding', () => {
    expect(pricePaneHeight({ total: 800, legendHeight: 32, panes: none, paneHeights })).toBe(800 - 32 - 22 - 4)
  })

  it('takes less for a two-row legend than a one-row legend', () => {
    const oneRow = pricePaneHeight({ total: 800, legendHeight: 32, panes: none, paneHeights })
    const twoRow = pricePaneHeight({ total: 800, legendHeight: 68, panes: none, paneHeights })

    expect(oneRow).toBe(800 - 32 - 22 - 4)
    expect(twoRow).toBe(800 - 68 - 22 - 4)
    expect(oneRow).toBeGreaterThan(twoRow)
  })

  it('subtracts each enabled lower pane and its border', () => {
    const panes = { volume: true, rsi: true, macd: false }
    expect(pricePaneHeight({ total: 800, legendHeight: 32, panes, paneHeights })).toBe(800 - 32 - 22 - 4 - 97 - 121)
  })

  it('never shrinks below the readable floor in a short window with every pane on', () => {
    const panes = { volume: true, rsi: true, macd: true }
    expect(pricePaneHeight({ total: 300, legendHeight: 68, panes, paneHeights })).toBe(MIN_PRICE_HEIGHT)
    expect(pricePaneHeight({ total: 0, legendHeight: 68, panes, paneHeights })).toBe(MIN_PRICE_HEIGHT)
  })
})

describe('scaleFromDrag', () => {
  it('leaves the scale alone when the pointer has not moved', () => {
    expect(scaleFromDrag(1.5, 0)).toBe(1.5)
  })

  it('compresses when dragged down', () => {
    expect(scaleFromDrag(1, 60)).toBeGreaterThan(1)
  })

  it('stretches when dragged up', () => {
    expect(scaleFromDrag(1, -60)).toBeLessThan(1)
  })

  it('clamps to the allowed range', () => {
    expect(scaleFromDrag(1, 100_000)).toBe(MAX_Y_SCALE)
    expect(scaleFromDrag(1, -100_000)).toBe(MIN_Y_SCALE)
  })
})

describe('price panning', () => {
  it('moves the price window without changing its span', () => {
    const still = geometry()
    const moved = geometry({ yShift: 0.25 })
    const span = still.top - still.bottom

    expect(moved.top - moved.bottom).toBeCloseTo(span)
    expect(moved.top).toBeCloseTo(still.top + span * 0.25)
    expect(moved.bottom).toBeCloseTo(still.bottom + span * 0.25)
  })

  it('pans on top of the zoomed scale', () => {
    const zoomed = geometry({ yScale: 2 })
    const both = geometry({ yScale: 2, yShift: -0.5 })

    expect(both.top).toBeCloseTo(zoomed.top - (zoomed.top - zoomed.bottom) * 0.5)
  })

  it('turns a vertical drag into a fraction of the plot height', () => {
    expect(shiftFromDrag(0, 86, 344)).toBeCloseTo(0.25)
    expect(shiftFromDrag(0.5, -172, 344)).toBeCloseTo(0)
  })

  it('bounds the shift so the bars cannot be lost for good', () => {
    expect(shiftFromDrag(0, 1e6, 344)).toBe(MAX_Y_SHIFT)
    expect(shiftFromDrag(0, -1e6, 344)).toBe(-MAX_Y_SHIFT)
  })

  it('turns a horizontal drag into whole bars', () => {
    expect(barsFromDrag(70, 23.27)).toBe(3)
    expect(barsFromDrag(-70, 23.27)).toBe(-3)
    expect(Object.is(barsFromDrag(-5, 23.27), 0)).toBe(true)
  })
})

describe('time labels', () => {
  const now = new Date('2026-09-29')
  const days = (from, to) => [{ date: from }, { date: to }]

  it('uses day labels for a short window in the current year', () => {
    expect(timeLabelStyle(days('2026-08-01', '2026-09-28'), now)).toBe('day')
  })

  it('uses month-year labels once the window spans more than half a year', () => {
    expect(timeLabelStyle(days('2025-09-01', '2026-09-28'), now)).toBe('month')
  })

  it('uses month-year labels for a window panned into an earlier year', () => {
    expect(timeLabelStyle(days('2024-03-01', '2024-04-01'), now)).toBe('month')
  })

  it('formats each style', () => {
    expect(formatTimeLabel('2024-03-12', 'day')).toBe('12 Mar')
    expect(formatTimeLabel('2024-03-12', 'month')).toBe('Mar 24')
    expect(formatTimeLabel('2024-04-01', 'month')).toBe('Apr 24')
  })
})

describe('time-axis zoom', () => {
  it('shows fewer bars as the axis is dragged right and more as it is dragged left', () => {
    expect(barCountFromDrag(100, 150)).toBeCloseTo(100 / Math.E)
    expect(barCountFromDrag(100, -150)).toBeCloseTo(100 * Math.E)
    expect(barCountFromDrag(100, 0)).toBe(100)
  })
})
