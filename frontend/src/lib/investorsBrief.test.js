import { describe, expect, it } from 'vitest'

import { copyLine, flowLine, investorsHeadline, personSentence } from './investorsBrief'

const hub = { quarter: '2026-06-30', filed: 87, tracked: 89, newest_quarter: '2026-09-30', newest_filed: 7 }
const person = (latest, extra = {}) => ({ name: 'X', latest_quarter: latest, new_count: 5, exited_count: 2, top_holdings: [], ...extra })

describe('investorsHeadline', () => {
  const named = (name, latest) => person(latest, { name })

  it('is one short line naming who you follow that has not filed', () => {
    expect(investorsHeadline(hub, [named('Bill Ackman', '2026-06-30'), named('Warren Buffett', '2026-06-30')])).toBe(
      '7 of 89 funds have filed Q3; Ackman and Buffett have not yet.',
    )
    expect(investorsHeadline(hub, [named('Bill Ackman', '2026-09-30'), named('Warren Buffett', '2026-06-30')])).toBe(
      '7 of 89 funds have filed Q3; Buffett has not yet.',
    )
  })

  it('counts instead of naming when you follow many', () => {
    const many = ['A B', 'C D', 'E F'].map((name) => named(name, '2026-06-30'))
    expect(investorsHeadline(hub, many)).toBe('7 of 89 funds have filed Q3; three you follow have not yet.')
  })

  it('says when the people you follow are in', () => {
    expect(investorsHeadline(hub, [named('Bill Ackman', '2026-09-30')])).toBe('7 of 89 funds have filed Q3, Ackman included.')
    expect(investorsHeadline(hub, [])).toBe('7 of 89 funds have filed Q3.')
  })

  it('uses the latest quarter when every fund is in', () => {
    expect(investorsHeadline({ ...hub, newest_quarter: '2026-06-30' }, [])).toBe('87 of 89 funds have filed Q2.')
  })

  it('has a quiet line before anything is imported', () => {
    expect(investorsHeadline({ tracked: 3, quarter: null }, [])).toBe('No filings imported yet for the 3 funds you track.')
    expect(investorsHeadline(undefined, [])).toBeNull()
  })
})

describe('personSentence', () => {
  it('says what they did and how much of it you own', () => {
    const investor = person('2026-06-30', { top_holdings: [{ ticker: 'AAPL' }, { ticker: 'AXP' }, { ticker: 'KO' }] })
    expect(personSentence(investor, new Set(['AAPL']))).toBe('Last quarter they opened 5 positions and closed 2. One of their biggest holdings is one you own.')
    expect(personSentence({ ...investor, new_count: 1, exited_count: 0 }, new Set(['AAPL', 'KO']))).toBe(
      'Last quarter they opened 1 position and closed none. Two of their biggest holdings are ones you own.',
    )
  })

  it('stays quiet about changes it does not know', () => {
    expect(personSentence(person('2026-06-30', { new_count: null }), new Set())).toBe('')
  })
})

describe('copyLine', () => {
  it('says how copying compared with the index, a year', () => {
    expect(copyLine({ copy_excess_cagr_pct: -14.19 })).toBe('Copying them ran 14.2 points a year behind the S&P 500')
    expect(copyLine({ copy_excess_cagr_pct: 3 })).toBe('Copying them ran 3.0 points a year ahead of the S&P 500')
    expect(copyLine({ copy_excess_cagr_pct: null })).toBeNull()
  })
})

describe('flowLine', () => {
  it('counts the funds, the new ones and whether you own it', () => {
    expect(flowLine({ bought: 19, new: 1 }, 'bought', true)).toBe('19 funds bought · 1 new · you own it')
    expect(flowLine({ sold: 22, new: 4 }, 'sold', false)).toBe('22 funds sold')
  })
})
