import { describe, expect, it } from 'vitest'
import { fmtEur, fmtMoney, fmtQty, fmtPct, pctTone, pctToneClass } from './format'

describe('fmtMoney', () => {
  it('formats a price in the instrument currency, not the reporting one', () => {
    // A USD price rendered as euros was a €5,136.75 overstatement's visible half.
    expect(fmtMoney('510.09', 'USD')).toContain('510.09')
    expect(fmtMoney('510.09', 'USD')).not.toBe(fmtEur('510.09'))
  })

  it('falls back to euros when a row carries no currency', () => {
    expect(fmtMoney('10.00', undefined)).toBe(fmtEur('10.00'))
    expect(fmtMoney('10.00', '')).toBe(fmtEur('10.00'))
  })

  it('puts the sign outside the currency symbol', () => {
    expect(fmtMoney('-5.50', 'EUR').startsWith('-')).toBe(true)
    expect(fmtMoney('5.50', 'EUR', { sign: true }).startsWith('+')).toBe(true)
  })
})

describe('fmtQty', () => {
  it('keeps whole share counts whole', () => {
    expect(fmtQty('20.0000')).toBe('20')
  })

  it('keeps the decimals on a fractional holding', () => {
    expect(fmtQty('2.5000')).toBe('2.5')
  })
})

describe('fmtPct', () => {
  it('renders a value that rounds to zero without a sign', () => {
    expect(fmtPct(-0.04, { decimals: 1 })).toBe('0.0%')
    expect(fmtPct(0.04, { decimals: 1 })).toBe('0.0%')
    expect(fmtPct(-0.04, { decimals: 1, sign: false })).toBe('0.0%')
  })
})

describe('pctTone', () => {
  it('is neutral for absent and zero-rounding values', () => {
    expect(pctTone(null)).toBe('neutral')
    expect(pctTone(NaN)).toBe('neutral')
    expect(pctTone(-0.003)).toBe('neutral')
    expect(pctTone(0)).toBe('neutral')
  })

  it('splits the rest by sign', () => {
    expect(pctTone(0.4)).toBe('positive')
    expect(pctTone(-2)).toBe('negative')
    expect(pctTone(-0.04, 1)).toBe('neutral')
    expect(pctTone(-0.06, 1)).toBe('negative')
  })
})

describe('pctToneClass', () => {
  it('maps tones to text classes', () => {
    expect(pctToneClass(1)).toBe('text-emerald-400')
    expect(pctToneClass(-1)).toBe('text-red-400')
    expect(pctToneClass(0)).toBe('text-zinc-500')
    expect(pctToneClass(null, 2, 'text-zinc-600')).toBe('text-zinc-600')
  })
})
