import { describe, expect, it } from 'vitest'

import { ACTION_LABEL, GRADE_LABEL, actionLabel, actionTone, checkLine, trendSentence, verdictTicker } from './verdicts'

describe('verdict wording', () => {
  it('labels every action the backend can send', () => {
    expect(ACTION_LABEL).toEqual({
      buy: 'Passes quality screen',
      add: 'Passes quality screen',
      hold: 'Hold',
      trim: 'Trim',
      sell_review: 'Review',
      not_a_fit: 'Not a fit',
      no_verdict: 'No verdict',
    })
  })

  it('names an action by its label', () => {
    expect(actionLabel({ action: 'hold' })).toBe('Hold')
    expect(actionLabel({ action: 'sell_review' })).toBe('Review')
  })

  it('never colours passing the quality screen as a buy, and colours trimming as a warning', () => {
    expect(actionTone('buy')).toBeUndefined()
    expect(actionTone('add')).toBeUndefined()
    expect(actionTone('trim')).toBe('warn')
    expect(actionTone('hold')).toBeUndefined()
  })

  it('never colours a sell as down-red: review reads as a warning', () => {
    expect(actionTone('sell_review')).toBe('warn')
  })

  it('names both grades in words', () => {
    expect(GRADE_LABEL.quality).toEqual({ strong: 'Strong', incomplete: 'Incomplete', mixed: 'Mixed', weak: 'Weak', unknown: 'Not enough data' })
    expect(GRADE_LABEL.valuation).toEqual({
      cheap: 'Below usual P/E',
      fair: 'Within usual P/E',
      expensive: 'Above usual P/E',
      not_judged: 'Not judged',
    })
  })
})

describe('checkLine', () => {
  it('prints a percent figure beside what it needs', () => {
    expect(checkLine({ key: 'roe', label: 'Return on equity', status: 'pass', value: 31.24, threshold: '15%' })).toBe(
      'Return on equity 31.2% in a typical year · needs 15%',
    )
  })

  it('prints debt as a plain ratio', () => {
    expect(checkLine({ key: 'debt', label: 'Debt', status: 'fail', value: 1.46, threshold: 'at most 1.0' })).toBe(
      'Debt 1.5 × equity, latest quarter · needs at most 1.0',
    )
  })

  it('says growth is a yearly rate over five years', () => {
    expect(checkLine({ key: 'revenue_growth', label: 'Revenue growth', value: 5.5, threshold: '5% a year' })).toBe(
      'Revenue growth 5.5% a year over 5 years · needs 5% a year',
    )
  })

  it('says how much of the profit arrived as free cash', () => {
    expect(checkLine({ key: 'cash', label: 'Cash behind the profit', value: 97.52, threshold: '80% of profit' })).toBe(
      'Cash behind the profit 97.5% of profit, in a typical year · needs 80% of profit',
    )
  })

  it('says no figure instead of a zero', () => {
    expect(checkLine({ label: 'Return on capital', status: 'unknown', value: null, threshold: '10%' })).toBe(
      'Return on capital · no figure',
    )
  })

  it('keeps a real zero', () => {
    expect(checkLine({ key: 'margins', label: 'Margins', status: 'fail', value: 0, threshold: '10%' })).toBe(
      'Margins 0% in a typical year · needs 10%',
    )
  })
})

describe('trendSentence', () => {
  it('says under or above the 200-day average', () => {
    expect(trendSentence(-12.04)).toBe('12% under its 200-day average')
    expect(trendSentence(8)).toBe('8% above its 200-day average')
  })

  it('says nothing without a figure', () => {
    expect(trendSentence(null)).toBeNull()
  })
})

describe('verdictTicker', () => {
  it('asks only about US-dollar listings', () => {
    expect(verdictTicker({ ticker: 'nvda', currency: 'USD' })).toBe('NVDA')
    expect(verdictTicker({ ticker: 'SAP', currency: 'EUR' })).toBeNull()
  })
})
