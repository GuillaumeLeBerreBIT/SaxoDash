import { describe, expect, it } from 'vitest'
import { fmtClock, oldestPricedAt, priceBasis, weakestPriceBasis } from './pricing'

const position = (price_source, priced_at) => ({ price_source, priced_at })

describe('priceBasis', () => {
  it('names each rung of the ladder', () => {
    expect(priceBasis('live').label).toBe('Live')
    expect(priceBasis('derived').label).toBe('Derived')
    expect(priceBasis('cost').label).toBe('At cost')
  })

  it('treats an unknown or missing source as live', () => {
    expect(priceBasis(undefined).label).toBe('Live')
    expect(priceBasis('something-new').label).toBe('Live')
  })
})

describe('weakestPriceBasis', () => {
  it('reports the worst-priced position, not the best', () => {
    const positions = [position('live'), position('derived'), position('live')]
    expect(weakestPriceBasis(positions).label).toBe('Derived')
  })

  it('lets an unpriced position outrank a derived one', () => {
    expect(weakestPriceBasis([position('derived'), position('cost')]).label).toBe('At cost')
  })

  it('reports live when every price is live', () => {
    expect(weakestPriceBasis([position('live'), position('live')]).label).toBe('Live')
  })

  it('is null for an empty book, so nothing is disclosed', () => {
    expect(weakestPriceBasis([])).toBeNull()
  })
})

describe('oldestPricedAt', () => {
  it('reports the staleset mark in the book', () => {
    const positions = [
      position('derived', '2026-09-03T21:13:00Z'),
      position('derived', '2026-09-03T19:02:00Z'),
    ]
    expect(oldestPricedAt(positions)).toBe('2026-09-03T19:02:00Z')
  })

  it('ignores positions that carry no stamp', () => {
    expect(oldestPricedAt([position('cost', null), position('derived', '2026-09-03T21:13:00Z')]))
      .toBe('2026-09-03T21:13:00Z')
  })

  it('is null when nothing is stamped', () => {
    expect(oldestPricedAt([position('cost', null)])).toBeNull()
  })
})
