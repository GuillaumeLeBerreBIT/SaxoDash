import { describe, expect, it } from 'vitest'

import { priceBarPosition, priceZone } from './priceBar'

const levels = { cheapBelow: 100, expensiveAbove: 200 }

describe('priceZone', () => {
  it('names the zone the price sits in', () => {
    expect(priceZone({ price: 80, ...levels })).toBe('cheap')
    expect(priceZone({ price: 150, ...levels })).toBe('fair')
    expect(priceZone({ price: 250, ...levels })).toBe('expensive')
  })

  it('counts a price on a boundary as fair', () => {
    expect(priceZone({ price: 100, ...levels })).toBe('fair')
    expect(priceZone({ price: 200, ...levels })).toBe('fair')
  })

  it('has no zone without a price or both levels', () => {
    expect(priceZone({ price: null, ...levels })).toBeNull()
    expect(priceZone({ price: 150, cheapBelow: null, expensiveAbove: 200 })).toBeNull()
    expect(priceZone({ price: 150, cheapBelow: 100, expensiveAbove: undefined })).toBeNull()
  })

  it('has no zone when the levels are not in order', () => {
    expect(priceZone({ price: 150, cheapBelow: 200, expensiveAbove: 100 })).toBeNull()
  })
})

describe('priceBarPosition', () => {
  it('puts the fair range in the middle third, linearly', () => {
    expect(priceBarPosition({ price: 100, ...levels })).toBeCloseTo(1 / 3)
    expect(priceBarPosition({ price: 150, ...levels })).toBeCloseTo(0.5)
    expect(priceBarPosition({ price: 200, ...levels })).toBeCloseTo(2 / 3)
  })

  it('places a cheap price in the first third, half the cheap line at the far left', () => {
    expect(priceBarPosition({ price: 75, ...levels })).toBeCloseTo(1 / 6)
    expect(priceBarPosition({ price: 50, ...levels })).toBe(0)
    expect(priceBarPosition({ price: 10, ...levels })).toBe(0)
  })

  it('places an expensive price in the last third, one and a half times the line at the far right', () => {
    expect(priceBarPosition({ price: 250, ...levels })).toBeCloseTo(5 / 6)
    expect(priceBarPosition({ price: 900, ...levels })).toBe(1)
  })

  it('is null when the zone cannot be judged', () => {
    expect(priceBarPosition({ price: 150, cheapBelow: null, expensiveAbove: 200 })).toBeNull()
  })

  it('accepts figures as strings, as the API sends decimals', () => {
    expect(priceBarPosition({ price: '150', cheapBelow: '100', expensiveAbove: '200' })).toBeCloseTo(0.5)
  })
})
