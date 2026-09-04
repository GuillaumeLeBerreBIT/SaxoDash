import { describe, expect, it } from 'vitest'
import { fmtEur, fmtMoney, fmtQty } from './format'

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
