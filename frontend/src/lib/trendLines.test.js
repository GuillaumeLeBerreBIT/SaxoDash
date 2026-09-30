import { describe, expect, it } from 'vitest'

import { indexForDate, resolveTrendLines, toTrendLineShape } from './trendLines'

const allBars = Array.from({ length: 20 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}` }))

describe('indexForDate', () => {
  it('finds the index of a bar by its date', () => {
    expect(indexForDate(allBars, '2026-08-05')).toBe(4)
  })

  it('is null for a date not in the dataset', () => {
    expect(indexForDate(allBars, '2026-09-01')).toBeNull()
  })
})

describe('toTrendLineShape', () => {
  it('converts the decimal strings DRF sends into numbers', () => {
    const shape = toTrendLineShape({
      id: 7, start_bar_date: '2026-08-01', start_price: '100.00',
      end_bar_date: '2026-08-10', end_price: '110.50', label: 'Breakout',
    })

    expect(shape).toEqual({
      id: 7,
      start: { barDate: '2026-08-01', price: 100 },
      end: { barDate: '2026-08-10', price: 110.5 },
      label: 'Breakout',
    })
  })
})

describe('resolveTrendLines', () => {
  const line = (overrides = {}) =>
    toTrendLineShape({
      id: 1, start_bar_date: '2026-08-01', start_price: '100.00',
      end_bar_date: '2026-08-05', end_price: '110.00', label: '', ...overrides,
    })

  it('draws the segment across the visible window, extrapolated to its right edge', () => {
    const [resolved] = resolveTrendLines([line()], { allBars, windowStart: 0, windowLength: 20 })

    expect(resolved.x1).toBe(0)
    expect(resolved.y1).toBe(100)
    expect(resolved.x2).toBe(19)
    expect(resolved.y2).toBeCloseTo(100 + ((110 - 100) / 4) * 19)
  })

  it('keeps projecting forward after both anchors have scrolled out of the window', () => {
    const [resolved] = resolveTrendLines([line()], { allBars, windowStart: 10, windowLength: 10 })

    expect(resolved).toBeDefined()
    expect(resolved.x1).toBe(0)
    expect(resolved.y1).toBeCloseTo(125)
    expect(resolved.x2).toBe(9)
    expect(resolved.y2).toBeCloseTo(147.5)
  })

  it('extends from whichever anchor is earlier, regardless of which was start or end', () => {
    const reversed = line({
      start_bar_date: '2026-08-05', start_price: '110.00',
      end_bar_date: '2026-08-01', end_price: '100.00',
    })
    const [resolved] = resolveTrendLines([reversed], { allBars, windowStart: 0, windowLength: 20 })

    expect(resolved.y1).toBe(100)
  })

  it('renders a partial ray when only its earlier anchor is within the window', () => {
    const [resolved] = resolveTrendLines([line()], { allBars, windowStart: 0, windowLength: 3 })

    expect(resolved).toBeDefined()
    expect(resolved.x1).toBe(0)
    expect(resolved.x2).toBe(2)
  })

  it("omits a line whose earlier anchor the window hasn't panned back to yet", () => {
    const future = line({
      start_bar_date: '2026-08-16', start_price: '100.00',
      end_bar_date: '2026-08-20', end_price: '110.00',
    })
    const resolved = resolveTrendLines([future], { allBars, windowStart: 0, windowLength: 5 })

    expect(resolved).toEqual([])
  })

  it('omits a line with an anchor date outside the fetched history', () => {
    const missing = line({ start_bar_date: '2099-01-01' })
    const resolved = resolveTrendLines([missing], { allBars, windowStart: 0, windowLength: 20 })

    expect(resolved).toEqual([])
  })

  it('omits a flat (same-bar) line rather than dividing by zero', () => {
    const flat = line({ end_bar_date: '2026-08-01', end_price: '105.00' })
    const resolved = resolveTrendLines([flat], { allBars, windowStart: 0, windowLength: 20 })

    expect(resolved).toEqual([])
  })

  it('carries the label through unchanged', () => {
    const [resolved] = resolveTrendLines([line({ label: 'Support' })], { allBars, windowStart: 0, windowLength: 20 })

    expect(resolved.label).toBe('Support')
  })
})
