import { describe, expect, it } from 'vitest'

import { ratingBand } from './ratingBand'

describe('ratingBand', () => {
  it('splits 0 to 1 into five equal bands', () => {
    expect(ratingBand(0)).toBe(0)
    expect(ratingBand(0.2)).toBe(1)
    expect(ratingBand(0.39)).toBe(1)
    expect(ratingBand(0.6)).toBe(3)
    expect(ratingBand(0.8)).toBe(4)
    expect(ratingBand(1)).toBe(4)
  })

  it('clamps a fraction outside 0 to 1', () => {
    expect(ratingBand(-0.3)).toBe(0)
    expect(ratingBand(1.7)).toBe(4)
  })
})
