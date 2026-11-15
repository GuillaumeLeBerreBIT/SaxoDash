import { describe, expect, it } from 'vitest'

import { needsYou, standingSentence } from './standing'

describe('standingSentence', () => {
  it('says how much more the investments are worth than was paid', () => {
    expect(standingSentence({ total_value: '29100.40', total_pnl: '2150.00', total_pnl_pct: '7.98' })).toBe(
      'Your investments are worth €29,100, €2,150 more than you paid (8.0%).',
    )
  })

  it('says less for a loss and keeps the figures positive', () => {
    expect(standingSentence({ total_value: '9000', total_pnl: '-1000', total_pnl_pct: '-10' })).toBe(
      'Your investments are worth €9,000, €1,000 less than you paid (10.0%).',
    )
  })

  it('leaves the percentage out when it is unknown and says nothing without a result', () => {
    expect(standingSentence({ total_value: '9000', total_pnl: '500', total_pnl_pct: null })).toBe(
      'Your investments are worth €9,000, €500 more than you paid.',
    )
    expect(standingSentence({ total_value: '9000', total_pnl: null })).toBeNull()
    expect(standingSentence(undefined)).toBeNull()
  })
})

describe('needsYou', () => {
  const items = [{ kind: 'single_name' }, { kind: 'concentration' }, { kind: 'earnings_soon' }]

  it('drops the concentration notes when the cap breach already says it', () => {
    expect(needsYou(items, [{ ticker: 'MSFT' }])).toEqual([{ kind: 'earnings_soon' }])
  })

  it('keeps everything when no holding is over the cap', () => {
    expect(needsYou(items, [])).toEqual(items)
  })
})
