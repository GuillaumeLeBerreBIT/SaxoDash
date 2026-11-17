import { describe, expect, it } from 'vitest'

import { bestActionFirst, mergeShareClasses } from './shelfRows'

const row = (ticker, name = ticker) => ({ ticker, name, uic: ticker })

describe('mergeShareClasses', () => {
  it('folds a second share class of one company into the first row', () => {
    const merged = mergeShareClasses([row('GOOGL', 'Alphabet'), row('MSFT', 'Microsoft'), row('GOOG', 'Alphabet')])
    expect(merged.map((item) => item.ticker)).toEqual(['GOOGL', 'MSFT'])
    expect(merged[0].also).toEqual(['GOOG'])
    expect(merged[1].also).toEqual([])
  })

  it('never merges rows without a name', () => {
    expect(mergeShareClasses([row('AAA', null), row('BBB', null)])).toHaveLength(2)
  })
})

describe('bestActionFirst', () => {
  it('puts buy and add first, a failed company last, and keeps the shelf order within one action', () => {
    const verdicts = { A: { action: 'wait' }, B: { action: 'buy' }, C: { action: 'not_a_fit' }, D: { action: 'buy' }, E: null }
    const sorted = bestActionFirst(['A', 'B', 'C', 'D', 'E'].map((ticker) => row(ticker)), verdicts)
    expect(sorted.map((item) => item.ticker)).toEqual(['B', 'D', 'A', 'C', 'E'])
  })

  it('leaves the order alone until verdicts have loaded', () => {
    const items = [row('A'), row('B')]
    expect(bestActionFirst(items, undefined)).toEqual(items)
  })
})
