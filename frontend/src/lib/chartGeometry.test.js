import { describe, expect, it } from 'vitest'

import { PAD_R, indexFromPointer, linePath, paneGeometry, priceGeometry } from './chartGeometry'

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
