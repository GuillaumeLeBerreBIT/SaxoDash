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

describe('fmtClock', () => {
  const now = new Date('2026-09-04T18:00:00Z')

  const timeOnly = (iso) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  it('shows the time alone for a stamp from today', () => {
    expect(fmtClock('2026-09-04T09:15:00Z', now)).toBe(timeOnly('2026-09-04T09:15:00Z'))
  })

  it('names the day for a stamp from earlier this week', () => {
    // The blind spot: the bare time for last Tuesday reads as minutes ago.
    const iso = '2026-09-01T09:15:00Z'
    const stamp = fmtClock(iso, now)

    expect(stamp).not.toBe(timeOnly(iso))
    expect(stamp).toContain(timeOnly(iso))
    expect(stamp).toMatch(/^[A-Za-z]/)
  })

  it('dates a stamp older than a week', () => {
    expect(fmtClock('2026-08-20T09:15:00Z', now)).toMatch(/Aug/)
  })

  it('is null for a missing or unparseable stamp', () => {
    expect(fmtClock(null, now)).toBeNull()
    expect(fmtClock('not a date', now)).toBeNull()
  })
})
