import { describe, expect, it } from 'vitest'

import { BRIEF_LIMIT, briefHeadline, briefItems } from './brief'

const position = (ticker, weight, extra = {}) => ({ ticker, name: `${ticker} Inc.`, weight, value: String(weight * 100), pnl_pct: 5, ...extra })
const base = { total: 10_000, verdicts: {}, fundBuys: new Map(), fundSells: new Map(), earnings: [] }

describe('briefItems', () => {
  it('puts a weaker business first and says review is not a sale', () => {
    const items = briefItems({
      ...base,
      positions: [position('NBIS', 9, { pnl_pct: -49.8 })],
      verdicts: { NBIS: { action: 'sell_review', reason: 'Story check failed: Return on equity, Revenue growth' } },
    })
    expect(items[0]).toMatchObject({ ticker: 'NBIS', word: 'Review', tone: 'warn', title: 'NBIS Inc. needs a second look' })
    expect(items[0].body).toBe('Return on equity and revenue growth now fail the quality checks. You are down 49.8% on it. Review means read the story again before deciding, not sell.')
  })

  it('names a holding over the cap with what trimming back would free', () => {
    const items = briefItems({ ...base, positions: [position('MSFT', 29.7, { value: '2970' })], verdicts: { MSFT: { action: 'hold', capped: true } } })
    expect(items[0]).toMatchObject({ ticker: 'MSFT', title: 'MSFT Inc. is 29.7% of your portfolio', word: 'Hold · over cap' })
    expect(items[0].body).toBe('Your cap is 15%. Trimming back to 15% would free about €1,470. The price is still in its cheap range, so this is about concentration, not the company.')
  })

  it('says when a holding can be added to', () => {
    const items = briefItems({ ...base, positions: [position('NVDA', 11)], verdicts: { NVDA: { action: 'add' } } })
    expect(items[0]).toMatchObject({ ticker: 'NVDA', word: 'Add', tone: 'up', title: 'NVDA Inc. is below its cheap line' })
  })

  it('reports fund buying and selling of what you hold, and reports coming up', () => {
    const items = briefItems({
      ...base,
      positions: [position('AMZN', 14), position('GOOGL', 12)],
      fundBuys: new Map([['AMZN', 19]]),
      fundSells: new Map([['GOOGL', 22]]),
      earnings: [{ ticker: 'AMZN', date: '2026-11-20', days_until: 9 }],
    })
    expect(items.map((item) => item.title)).toEqual([
      '19 tracked funds bought AMZN Inc. last quarter',
      '22 tracked funds sold GOOGL Inc. last quarter',
      'AMZN Inc. reports in 9 days',
    ])
  })

  it('raises a report in the next three days above the cap and the funds', () => {
    const items = briefItems({
      ...base,
      positions: [position('MSFT', 30), position('NVDA', 11)],
      fundBuys: new Map([['NVDA', 9]]),
      earnings: [{ ticker: 'NVDA', date: '2026-11-17', days_until: 1 }],
    })
    expect(items.map((item) => item.kind)).toEqual(['earnings', 'cap', 'funds'])
    expect(items[0].title).toBe('NVDA Inc. reports tomorrow')
  })

  it('keeps the most important few', () => {
    const positions = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((ticker) => position(ticker, 20))
    expect(briefItems({ ...base, positions })).toHaveLength(BRIEF_LIMIT)
  })

  it('is empty when nothing needs attention', () => {
    expect(briefItems({ ...base, positions: [position('AAPL', 10)], verdicts: { AAPL: { action: 'hold' } } })).toEqual([])
  })
})

describe('briefHeadline', () => {
  it('counts what there is to look at', () => {
    expect(briefHeadline(0)).toBe('Nothing in your portfolio needs you today.')
    expect(briefHeadline(1)).toBe('One thing to look at in your portfolio today.')
    expect(briefHeadline(3)).toBe('Three things to look at in your portfolio today.')
    expect(briefHeadline(12)).toBe('12 things to look at in your portfolio today.')
  })
})
