import { describe, expect, it } from 'vitest'

import { resolveZones, toZoneShape, zoneFromPoints } from './chartZones'

const bars = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'].map((date) => ({ date }))

const raw = (extra = {}) => ({
  id: 7,
  start_bar_date: '2026-08-02',
  end_bar_date: '2026-08-04',
  low_price: '168.00',
  high_price: '175.50',
  label: 'Support',
  ...extra,
})

describe('toZoneShape', () => {
  it('turns a saved zone into numbers and dates the chart can use', () => {
    expect(toZoneShape(raw())).toEqual({
      id: 7, start: '2026-08-02', end: '2026-08-04', low: 168, high: 175.5, label: 'Support',
    })
  })

  it('gives an unlabelled zone an empty label', () => {
    expect(toZoneShape(raw({ label: null })).label).toBe('')
  })
})

describe('resolveZones', () => {
  it('places a zone on the window bars it covers', () => {
    const [zone] = resolveZones([toZoneShape(raw())], { allBars: bars, windowStart: 0, windowLength: 5 })

    expect(zone).toMatchObject({ x1: 1, x2: 3, low: 168, high: 175.5 })
  })

  it('clips a zone that starts before the visible window', () => {
    const [zone] = resolveZones([toZoneShape(raw({ start_bar_date: '2026-08-01' }))], {
      allBars: bars, windowStart: 2, windowLength: 3,
    })

    expect(zone).toMatchObject({ x1: 0, x2: 1 })
  })

  it('drops a zone that lies entirely outside the window', () => {
    expect(resolveZones([toZoneShape(raw())], { allBars: bars, windowStart: 4, windowLength: 1 })).toEqual([])
  })

  it('drops a zone whose dates are not in the price history', () => {
    expect(resolveZones([toZoneShape(raw({ end_bar_date: '2030-01-01' }))], {
      allBars: bars, windowStart: 0, windowLength: 5,
    })).toEqual([])
  })
})

describe('zoneFromPoints', () => {
  it('orders the two clicks into early and late dates and low and high prices', () => {
    expect(zoneFromPoints({ barDate: '2026-08-04', price: 175 }, { barDate: '2026-08-02', price: 168 })).toEqual({
      startBarDate: '2026-08-02', endBarDate: '2026-08-04', low: 168, high: 175,
    })
  })
})
