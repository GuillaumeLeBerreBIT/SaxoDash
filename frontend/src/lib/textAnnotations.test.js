import { describe, expect, it } from 'vitest'

import { resolveTextAnnotations, toTextAnnotationShape } from './textAnnotations'

const allBars = Array.from({ length: 20 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}` }))

describe('toTextAnnotationShape', () => {
  it('converts the decimal string DRF sends into a number', () => {
    expect(toTextAnnotationShape({ id: 1, bar_date: '2026-08-05', price: '107.50', text: 'Gap' })).toEqual({
      id: 1,
      barDate: '2026-08-05',
      price: 107.5,
      text: 'Gap',
    })
  })
})

describe('resolveTextAnnotations', () => {
  const item = (overrides = {}) =>
    toTextAnnotationShape({ id: 1, bar_date: '2026-08-05', price: '107.50', text: 'Gap', ...overrides })

  it('resolves to a window-relative index when the bar is visible', () => {
    const [resolved] = resolveTextAnnotations([item()], { allBars, windowStart: 2, windowLength: 10 })

    expect(resolved).toEqual({ id: 1, text: 'Gap', index: 2, price: 107.5 })
  })

  it('omits an annotation whose bar has scrolled out of the window', () => {
    const resolved = resolveTextAnnotations([item()], { allBars, windowStart: 10, windowLength: 5 })

    expect(resolved).toEqual([])
  })

  it('omits an annotation with a date outside the fetched history', () => {
    const resolved = resolveTextAnnotations([item({ bar_date: '2099-01-01' })], { allBars, windowStart: 0, windowLength: 20 })

    expect(resolved).toEqual([])
  })
})
