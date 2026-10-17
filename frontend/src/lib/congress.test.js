import { describe, expect, it } from 'vitest'

import { activity, activityLabel, basisNote, fmtRange, partyLabel, tradeLabel } from './congress'

describe('partyLabel', () => {
  it('abbreviates the party and keeps the district', () => {
    expect(partyLabel('Democrat', 'CA11')).toBe('D-CA11')
    expect(partyLabel('Republican', 'TX02')).toBe('R-TX02')
  })
  it('falls back to the district alone when the party is unknown', () => {
    expect(partyLabel('', 'ZZ01')).toBe('ZZ01')
  })
})

describe('fmtRange', () => {
  it('formats a closed and an open range', () => {
    expect(fmtRange(15001, 50000)).toBe('$15,001–$50,000')
    expect(fmtRange(50000000, null)).toBe('Over $50,000,000')
  })
})

describe('tradeLabel', () => {
  it('names the kind and the option', () => {
    expect(tradeLabel({ kind: 'purchase', option: 'call', exercise: false })).toBe('Bought (call)')
    expect(tradeLabel({ kind: 'partial_sale', option: '', exercise: false })).toBe('Sold part')
    expect(tradeLabel({ kind: 'purchase', option: '', exercise: true })).toBe('Bought (exercise)')
  })
})

describe('basisNote', () => {
  it('lists only the caveats that apply', () => {
    expect(basisNote({ trades: 40, paper_reports: 2, failed_reports: 0, unparsed_rows: 0, unseen_sales: 3, unpriced: 0, since: '2021-01-01' }))
      .toBe('Estimated from 40 disclosed trades since 2021 at the midpoint of each reported range · 2 paper reports not included · 3 sales of holdings not seen bought ignored')
  })
  it('says from when prices reach back', () => {
    expect(basisNote({ trades: 40, since: '2021-01-01', priced_from: '2021-12-07' }))
      .toBe('Estimated from 40 disclosed trades since 2021, priced from Dec 2021 at the midpoint of each reported range')
  })
  it('says nothing is known yet for an empty basis', () => {
    expect(basisNote({})).toBe('No parsed trades yet.')
  })
})

describe('activity', () => {
  it('is null for an unknown ticker and for a stock nobody trades or holds', () => {
    expect(activity(null)).toBeNull()
    expect(activity({ holders: 0, buyers: 0, sellers: 0 })).toBeNull()
  })
  it('reports holders when nobody traded it recently', () => {
    expect(activity({ holders: 2, buyers: 0, sellers: 0 })).toEqual({ holders: 2 })
    expect(activityLabel({ holders: 1, buyers: 0, sellers: 0 }, 90)).toBe('1 member of Congress holds it (estimated); none traded it in reports filed in the last 90 days')
    expect(activityLabel({ holders: 3, buyers: 0, sellers: 0 }, 90)).toBe('3 members of Congress hold it (estimated); none traded it in reports filed in the last 90 days')
  })
  it('reports buyers and sellers', () => {
    expect(activity({ holders: 1, buyers: 3, sellers: 1 })).toEqual({ buyers: 3, sellers: 1 })
    expect(activityLabel({ holders: 1, buyers: 3, sellers: 1 }, 90)).toBe('3 members of Congress bought and 1 sold in reports filed in the last 90 days · 1 holds it (estimated)')
  })
})
