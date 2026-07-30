import { describe, it, expect } from 'vitest'
import { toAccountBreakdownData } from './accounts'

describe('toAccountBreakdownData', () => {
  it('maps accounts to name/value/color', () => {
    const result = toAccountBreakdownData([
      { bank: 'KBC', balance: '12500.00', accent: '#1d4ed8' },
    ])
    expect(result).toEqual([{ name: 'KBC', value: 12500, color: '#1d4ed8' }])
  })

  it('falls back to default color when accent is missing', () => {
    const result = toAccountBreakdownData([
      { bank: 'Saxo', balance: '850.00', accent: '' },
    ])
    expect(result[0].color).toBe('#3f3f46')
  })

  it('coerces balance to a number', () => {
    const result = toAccountBreakdownData([
      { bank: 'ING', balance: '2180.75', accent: '#ea580c' },
    ])
    expect(result[0].value).toBe(2180.75)
  })

  it('returns empty array for no accounts', () => {
    expect(toAccountBreakdownData([])).toEqual([])
  })
})
