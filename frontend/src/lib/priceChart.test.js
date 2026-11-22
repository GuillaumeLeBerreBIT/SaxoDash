import { describe, expect, it } from 'vitest'

import { indexAtPointer, previousClose, priceChartGeometry, yearRange } from './priceChart'

const bar = (date, close, extra = {}) => ({ date, open: close, high: close + 1, low: close - 1, close, volume: 100, ...extra })

const week = [
  bar('2026-11-16', 100),
  bar('2026-11-17', 104),
  bar('2026-11-18', 98),
  bar('2026-11-19', 110),
  bar('2026-11-20', 106),
]

describe('previousClose', () => {
  it('is the close before the latest bar', () => {
    expect(previousClose(week)).toBe(110)
  })

  it('is null with fewer than two bars', () => {
    expect(previousClose([bar('2026-11-20', 100)])).toBeNull()
    expect(previousClose([])).toBeNull()
  })
})

describe('yearRange', () => {
  it('is null until a full year of bars is loaded', () => {
    expect(yearRange(week)).toBeNull()
  })

  it('takes the lowest low and highest high of the last 252 bars', () => {
    const bars = Array.from({ length: 300 }, (_, i) => bar(`2025-01-${String((i % 28) + 1).padStart(2, '0')}`, 50))
    bars[10] = bar('2025-01-11', 5, { low: 1 })
    bars[290] = bar('2025-01-11', 90, { high: 120 })
    expect(yearRange(bars)).toEqual({ low: 49, high: 120 })
  })
})

describe('priceChartGeometry', () => {
  const size = { width: 400, height: 200 }

  it('needs two bars to draw a line', () => {
    expect(priceChartGeometry([bar('2026-11-20', 100)], size)).toBeNull()
  })

  it('maps the first and last close to the left and right of the plot, higher closes higher up', () => {
    const geometry = priceChartGeometry(week, size)
    expect(geometry.x(0)).toBeLessThan(geometry.x(4))
    expect(geometry.x(4)).toBe(geometry.plotRight)
    expect(geometry.y(110)).toBeLessThan(geometry.y(98))
  })

  it('stretches the scale to include the previous close', () => {
    const without = priceChartGeometry(week, size)
    const withFar = priceChartGeometry(week, { ...size, previous: 200 })
    expect(without.previousY).toBeNull()
    expect(withFar.previousY).toBeGreaterThan(withFar.top)
    expect(withFar.previousY).toBeLessThan(withFar.y(100))
  })

  it('puts ticks on round prices inside the plot', () => {
    const { ticks, top, bottom } = priceChartGeometry(week, size)
    expect(ticks.length).toBeGreaterThan(2)
    for (const tick of ticks) {
      expect(tick.y).toBeGreaterThanOrEqual(top)
      expect(tick.y).toBeLessThanOrEqual(bottom)
      expect(Number.isInteger(tick.value)).toBe(true)
    }
    const gaps = ticks.slice(1).map((tick, i) => tick.value - ticks[i].value)
    expect(new Set(gaps).size).toBe(1)
  })

  it('draws volume bars only when asked, and leaves room under the line for them', () => {
    const plain = priceChartGeometry(week, size)
    const withVolume = priceChartGeometry(week, { ...size, showVolume: true })
    expect(plain.volume).toEqual([])
    expect(withVolume.volume).toHaveLength(5)
    expect(withVolume.bottom).toBeLessThan(plain.bottom)
  })

  it('labels the date axis by day, month or year to match the span, without repeating a label', () => {
    const days = priceChartGeometry(week, size).dates.map((d) => d.text)
    expect(days[0]).toBe('16 Nov')
    const months = Array.from({ length: 120 }, (_, i) => bar(`2026-${String(Math.floor(i / 10) + 1).padStart(2, '0')}-${String((i % 10) + 1).padStart(2, '0')}`, 100 + i))
    const labels = priceChartGeometry(months, size).dates.map((d) => d.text)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels[0]).toBe('Jan')
  })
})

describe('date axis over a year', () => {
  it('never repeats a label when the range spans one calendar month twice', () => {
    const start = new Date(2025, 10, 20)
    const bars = Array.from({ length: 252 }, (_, i) => {
      const day = new Date(start)
      day.setDate(day.getDate() + Math.round(i * 1.45))
      return bar(day.toISOString().slice(0, 10), 100 + i)
    })
    const labels = priceChartGeometry(bars, { width: 800, height: 300 }).dates.map((tick) => tick.text)

    expect(new Set(labels).size).toBe(labels.length)
    expect(labels[0]).toBe('Nov 25')
  })
})

describe('indexAtPointer', () => {
  it('snaps a pointer to the nearest bar and clamps at both ends', () => {
    const geometry = priceChartGeometry(week, { width: 400, height: 200 })
    expect(indexAtPointer(-50, geometry, 5)).toBe(0)
    expect(indexAtPointer(9999, geometry, 5)).toBe(4)
    expect(indexAtPointer(geometry.x(2), geometry, 5)).toBe(2)
  })
})
