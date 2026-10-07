import { describe, expect, it } from 'vitest'

import { fmtAxisDollars, fmtAxisPct, fmtTooltipDollars } from './axisFormat'

describe('fmtAxisPct', () => {
  it.each([
    [44.5, '45%'],
    [0, '0%'],
    [-0.3, '0%'],
    [-12, '-12%'],
    [null, ''],
  ])('%s -> %s', (input, expected) => {
    expect(fmtAxisPct(input)).toBe(expected)
  })
})

describe('fmtAxisDollars', () => {
  it.each([
    [35e9, '$35B'],
    [2.1e9, '$2.1B'],
    [3e9, '$3B'],
    [850e6, '$850M'],
    [-2.1e9, '-$2.1B'],
    [1.2e12, '$1.2T'],
    [0, '$0'],
    [null, ''],
  ])('%s -> %s', (input, expected) => {
    expect(fmtAxisDollars(input)).toBe(expected)
  })
})

describe('fmtTooltipDollars', () => {
  it.each([
    [2_100_000_000, '$2.10B'],
    [-2_100_000_000, '-$2.10B'],
    [-450_000_000, '-$450M'],
    [null, '—'],
  ])('formats %s as %s', (input, expected) => {
    expect(fmtTooltipDollars(input)).toBe(expected)
  })
})
