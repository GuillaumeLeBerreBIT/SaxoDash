import { describe, expect, it } from 'vitest'

import { OTHER_SLICE, SECTOR_PALETTE } from './charts'

const MIN_DELTA_E = 15

const linear = (channel) => {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(linear)
}

const toLab = (hex) => {
  const [r, g, b] = rgb(hex)
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const [fx, fy, fz] = [x / 0.95047, y, z / 1.08883].map(f)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const deltaE = (a, b) => Math.hypot(...toLab(a).map((v, i) => v - toLab(b)[i]))

const series = [...SECTOR_PALETTE, OTHER_SLICE]

describe('SECTOR_PALETTE', () => {
  it('keeps every pair of slices at least a stated CIE76 distance apart', () => {
    const failures = []
    for (let i = 0; i < series.length; i++) {
      for (let j = i + 1; j < series.length; j++) {
        const distance = deltaE(series[i], series[j])
        if (distance < MIN_DELTA_E) failures.push(`${series[i]} vs ${series[j]}: ${distance.toFixed(1)}`)
      }
    }
    expect(failures).toEqual([])
  })
})
