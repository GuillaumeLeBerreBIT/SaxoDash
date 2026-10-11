import { describe, expect, it } from 'vitest'
import { monthlyAmount, monthlyTotal } from './subscriptions'

describe('monthlyAmount', () => {
  it('keeps a monthly amount as it is', () => {
    expect(monthlyAmount({ expected_amount: '12.00', cadence: 'monthly' })).toBe(12)
  })
  it('spreads a yearly amount over twelve months', () => {
    expect(monthlyAmount({ expected_amount: '120.00', cadence: 'yearly' })).toBe(10)
  })
  it('turns a weekly amount into its average month', () => {
    expect(monthlyAmount({ expected_amount: '3.00', cadence: 'weekly' })).toBeCloseTo(13, 5)
  })
  it('counts an unknown cadence as nothing rather than guessing', () => {
    expect(monthlyAmount({ expected_amount: '9.00', cadence: 'fortnightly' })).toBe(0)
  })
})

describe('monthlyTotal', () => {
  it('sums every subscription per month', () => {
    const subs = [
      { expected_amount: '10.00', cadence: 'monthly' },
      { expected_amount: '120.00', cadence: 'yearly' },
    ]
    expect(monthlyTotal(subs)).toBe(20)
  })
  it('leaves dismissed subscriptions out', () => {
    const subs = [
      { expected_amount: '10.00', cadence: 'monthly' },
      { expected_amount: '99.00', cadence: 'monthly', dismissed: true },
    ]
    expect(monthlyTotal(subs)).toBe(10)
  })
  it('is zero for nothing', () => {
    expect(monthlyTotal(undefined)).toBe(0)
    expect(monthlyTotal([])).toBe(0)
  })
})
