import { describe, expect, it } from 'vitest'
import { colorForCategory } from './charts'

describe('colorForCategory', () => {
  it('gives TRANSFER and SAVINGS a distinct neutral color, not a budgetable category color', () => {
    const transfer = colorForCategory('TRANSFER')
    const savings = colorForCategory('SAVINGS')
    const groceries = colorForCategory('GROCERIES')
    expect(transfer).not.toBe(groceries)
    expect(savings).not.toBe(groceries)
    expect(transfer).toBe(savings)
  })

  it('gives an unknown category the same neutral fallback, not GROCERIES colour', () => {
    const unknown = colorForCategory('SOME_FUTURE_CATEGORY')
    const groceries = colorForCategory('GROCERIES')
    expect(unknown).not.toBe(groceries)
  })

  it('still gives every real budgetable category its own distinct color', () => {
    const codes = ['GROCERIES', 'DINING', 'TRANSPORT', 'UTILITIES', 'SUBSCRIPTIONS', 'SHOPPING', 'HEALTH', 'TRAVEL', 'ENTERTAINMENT', 'OTHER']
    const colors = codes.map(colorForCategory)
    expect(new Set(colors).size).toBe(codes.length)
  })
})
