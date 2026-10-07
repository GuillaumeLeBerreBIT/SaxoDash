import { describe, expect, it } from 'vitest'

import { niceAxis, niceTicks } from './niceTicks'

describe('niceTicks', () => {
  it('rounds to 1/2/5 steps covering the range', () => {
    expect(niceTicks(0, 97, 5)).toEqual([0, 20, 40, 60, 80, 100])
  })

  it('includes zero for a range straddling it', () => {
    expect(niceTicks(-3, 3, 4)).toContain(0)
  })

  it('covers the extremes', () => {
    const ticks = niceTicks(97.3, 143.82, 5)
    expect(ticks[0]).toBeLessThanOrEqual(97.3)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(143.82)
    expect(ticks).toEqual([90, 100, 110, 120, 130, 140, 150])
  })

  it('has no float noise on small steps', () => {
    expect(niceTicks(0, 0.7, 7)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7])
  })

  it('returns a single tick for equal bounds', () => {
    expect(niceTicks(5, 5, 5)).toEqual([5])
  })

  it('returns nothing for non-finite input', () => {
    expect(niceTicks(NaN, 1, 5)).toEqual([])
    expect(niceTicks(0, Infinity, 5)).toEqual([])
  })
})

describe('niceAxis', () => {
  it('derives ticks and a matching domain from values', () => {
    const { ticks, domain } = niceAxis([12340, 48210.5], { count: 4 })
    expect(domain).toEqual([ticks[0], ticks[ticks.length - 1]])
    expect(ticks.every((t) => t % 5000 === 0)).toBe(true)
  })

  it('anchors at zero on request', () => {
    expect(niceAxis([310, 420], { includeZero: true }).domain[0]).toBe(0)
  })

  it('returns no props for degenerate data', () => {
    expect(niceAxis([])).toEqual({})
    expect(niceAxis([7])).toEqual({})
  })
})
