import { describe, expect, it } from 'vitest'

import {
  directoryChips, directoryInvestors, groupMoves, hubSubtitle, initials, moveSentence, seeAllTarget,
  signalSentence, stockLabel,
} from './investorHub'

const card = (over) => ({
  slug: 's', name: 'N', firm: 'F', styles: [], followed: false, stale: false, total_value: 1, positions: 1,
  new_count: 0, exited_count: 0, last_filing_at: null, ...over,
})

describe('directoryChips', () => {
  it('offers only the styles some investor has, in the fixed order, between Following and Stopped filing', () => {
    const cards = [card({ styles: ['Tech', 'Value'] }), card({ styles: ['Activist'] })]
    expect(directoryChips(cards)).toEqual([
      ['all', 'All'], ['following', 'Following'], ['Value', 'Value'], ['Activist', 'Activist'], ['Tech', 'Tech'],
      ['stale', 'Stopped filing'],
    ])
  })
})

describe('directoryInvestors', () => {
  const cards = [
    card({ slug: 'a', name: 'Ann', styles: ['Value'], followed: true, total_value: 5, last_filing_at: '2026-08-01' }),
    card({ slug: 'b', name: 'Bob', styles: ['Tech'], total_value: 9, last_filing_at: '2026-08-14' }),
    card({ slug: 'c', name: 'Cy', styles: ['Value'], stale: true, total_value: 1 }),
  ]
  const slugs = (options) => directoryInvestors(cards, { chip: 'all', query: '', sort: 'value', holderSlugs: new Set(), ...options }).map((c) => c.slug)

  it('filters by style, following and stopped filing', () => {
    expect(slugs({ chip: 'Value' })).toEqual(['a', 'c'])
    expect(slugs({ chip: 'following' })).toEqual(['a'])
    expect(slugs({ chip: 'stale' })).toEqual(['c'])
  })

  it('treats an unknown chip as All', () => {
    expect(slugs({ chip: 'nope' })).toEqual(['b', 'a', 'c'])
  })

  it('sorts by most recent filing with never-filed last', () => {
    expect(slugs({ sort: 'filed' })).toEqual(['b', 'a', 'c'])
  })

  it('still searches by name and by holder', () => {
    expect(slugs({ query: 'bob' })).toEqual(['b'])
    expect(slugs({ query: 'NVDA', holderSlugs: new Set(['c']) })).toEqual(['c'])
  })
})

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Warren Buffett')).toBe('WB')
    expect(initials('Bill & Melinda Gates Foundation Trust')).toBe('BT')
    expect(initials('Baillie Gifford')).toBe('BG')
  })

  it('copes with one word and with nothing', () => {
    expect(initials('Scion')).toBe('S')
    expect(initials('')).toBe('')
  })
})

describe('moveSentence', () => {
  it('says what happened in plain words', () => {
    expect(moveSentence({ kind: 'new', weight: 9.04 })).toBe('Opened a 9.0% position')
    expect(moveSentence({ kind: 'added', weight: 15, shares_change_pct: 32.4 })).toBe('Added 32% more shares · now 15.0%')
    expect(moveSentence({ kind: 'trimmed', weight: 12, shares_change_pct: -18 })).toBe('Cut shares by 18% · now 12.0%')
    expect(moveSentence({ kind: 'sold_out', previous_weight: 4.2 })).toBe('Sold out · was 4.2%')
  })

  it('does not invent a percentage it was not given', () => {
    expect(moveSentence({ kind: 'added', weight: 15, shares_change_pct: null })).toBe('Added shares · now 15.0%')
  })
})

describe('groupMoves', () => {
  it('groups in story order and drops empty groups', () => {
    const moves = [{ kind: 'new', cusip: '1' }, { kind: 'sold_out', cusip: '2' }, { kind: 'new', cusip: '3' }]
    expect(groupMoves(moves).map((g) => [g.kind, g.title, g.items.length])).toEqual([['new', 'New', 2], ['sold_out', 'Sold out', 1]])
  })
})

describe('signalSentence', () => {
  it('describes each stock shelf', () => {
    expect(signalSentence('convergent-buys', { bought: 7, new: 2 })).toBe('7 funds bought · 2 new')
    expect(signalSentence('convergent-buys', { bought: 3, new: 0 })).toBe('3 funds bought')
    expect(signalSentence('most-sold', { sold: 6 })).toBe('6 funds sold')
    expect(signalSentence('new-bets', { weight: 9.04, investors: [{ name: 'Bill Ackman' }] })).toBe('New 9.0% position · Bill Ackman')
  })
})

describe('seeAllTarget', () => {
  it('sends stock shelves to the Stocks table and investor shelves to the directory', () => {
    expect(seeAllTarget({ key: 'convergent-buys' })).toBe('/investors/stocks?view=bought')
    expect(seeAllTarget({ key: 'most-sold' })).toBe('/investors/stocks?view=sold')
    expect(seeAllTarget({ key: 'new-bets' })).toBe('/investors/stocks?view=new')
    expect(seeAllTarget({ key: 'following' })).toBe('/investors?chip=following#directory')
    expect(seeAllTarget({ key: 'just-filed' })).toBe('/investors?sort=filed#directory')
  })
})

describe('hubSubtitle', () => {
  it('says which quarter the signals describe and how many filed', () => {
    expect(hubSubtitle({ tracked: 82, quarter: '2026-06-30', filed: 61, newest_quarter: '2026-06-30', newest_filed: 61 }))
      .toBe('82 tracked · signals for Q2 2026 · 61 of 82 filed')
  })

  it('names the newer quarter when signals still describe the previous one', () => {
    expect(hubSubtitle({ tracked: 82, quarter: '2026-06-30', filed: 80, newest_quarter: '2026-09-30', newest_filed: 5 }))
      .toBe('82 tracked · signals for Q2 2026 · 80 of 82 filed · 5 have filed Q3 2026')
  })

  it('has nothing to say about signals before any import', () => {
    expect(hubSubtitle({ tracked: 3, quarter: null })).toBe('3 tracked · no filings imported yet')
    expect(hubSubtitle(undefined)).toBe('13F holdings of well-known investors')
  })
})

describe('stockLabel', () => {
  it('falls back to the issuer when the ticker is unresolved', () => {
    expect(stockLabel({ ticker: 'NVDA', issuer: 'NVIDIA CORP' })).toBe('NVDA')
    expect(stockLabel({ ticker: null, issuer: 'NVIDIA CORP' })).toBe('NVIDIA CORP')
  })
})
