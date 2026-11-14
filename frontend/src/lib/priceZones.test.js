import { describe, expect, it } from 'vitest'

import { entrySentence, priceZones, zoneOf } from './priceZones'

const verdict = (extra = {}) => ({
  action: 'wait', quality: 'strong', valuation: 'fair', cheap_below: 312, expensive_above: 401, ...extra,
})
const plan = { stop: { price: 340, source: 'atr' }, stopDistancePct: -4.6, size: { shares: 3, lossAtStop: 45 }, currency: 'USD' }

describe('priceZones', () => {
  it('takes the two prices from the verdict', () => {
    expect(priceZones(verdict())).toEqual({ buyBelow: 312, expensiveAbove: 401, buyable: true })
  })

  it('does not call the cheap zone a buy zone for a company that fails the quality checks', () => {
    expect(priceZones(verdict({ quality: 'weak' })).buyable).toBe(false)
  })

  it('has no zones without a valuation', () => {
    expect(priceZones(verdict({ valuation: 'not_judged', cheap_below: null, expensive_above: null }))).toBeNull()
    expect(priceZones(verdict({ cheap_below: 401, expensive_above: 312 }))).toBeNull()
    expect(priceZones(null)).toBeNull()
  })
})

describe('zoneOf', () => {
  const zones = { buyBelow: 312, expensiveAbove: 401 }

  it('names the zone a price is in', () => {
    expect([zoneOf(300, zones), zoneOf(356, zones), zoneOf(410, zones)]).toEqual(['cheap', 'fair', 'expensive'])
    expect(zoneOf(356, null)).toBeNull()
  })
})

describe('entrySentence', () => {
  it('says what to do, why, and at what price that changes', () => {
    expect(entrySentence({ verdict: verdict(), price: 356, plan })).toEqual({
      word: 'WAIT',
      tone: undefined,
      why: 'Strong company, fair price.',
      next: 'Becomes cheap below US$312.00 (12% lower). Expensive above US$401.00.',
      risk: "Stop-loss at US$340.00, 4.6% below today's close. Buying 3 shares today would risk €45.",
    })
  })

  it('names the buy zone when the price is in it', () => {
    const sentence = entrySentence({ verdict: verdict({ action: 'buy', valuation: 'cheap' }), price: 300, plan })
    expect([sentence.word, sentence.tone, sentence.why]).toEqual(['BUY', 'up', 'Strong company, cheap price.'])
    expect(sentence.next).toBe('In the buy zone: cheap for this company below US$312.00. Expensive above US$401.00.')
  })

  it('says a cheap price is not a buy when the company fails the checks', () => {
    const sentence = entrySentence({ verdict: verdict({ action: 'not_a_fit', quality: 'weak', valuation: 'cheap' }), price: 300, plan: null })
    expect(sentence.why).toBe('Weak company, cheap price.')
    expect(sentence.next).toBe('Cheap for this company below US$312.00, but it does not pass the quality checks.')
    expect(sentence.risk).toBeNull()
  })

  it('says where expensive starts and how far the buy zone is', () => {
    const sentence = entrySentence({ verdict: verdict({ action: 'hold', valuation: 'expensive' }), price: 420, plan })
    expect(sentence.next).toBe('Expensive for this company above US$401.00. Cheap below US$312.00 (26% lower).')
  })

  it('flags a price that crossed a zone since the verdict was made', () => {
    const sentence = entrySentence({ verdict: verdict(), price: 305, plan })
    expect(sentence.why).toBe('Strong company, cheap price.')
    expect(sentence.next).toMatch(/The verdict updates tonight\.$/)
  })

  it('gives only the stop when there is no size, and says so when there is no valuation', () => {
    const unjudged = verdict({ valuation: 'not_judged', cheap_below: null, expensive_above: null })
    const sentence = entrySentence({ verdict: unjudged, price: 356, plan: { ...plan, size: null } })
    expect(sentence.why).toBe('Strong company, no valuation yet.')
    expect(sentence.next).toBe('Too little earnings history to say what is cheap for this company.')
    expect(sentence.risk).toBe("Stop-loss at US$340.00, 4.6% below today's close.")
  })

  it('compares the stop-loss with your average price when you hold the stock', () => {
    const held = (avgCost) => entrySentence({ verdict: verdict({ action: 'hold' }), price: 356, plan: { ...plan, avgCost }, held: true }).risk
    expect(held(200)).toBe("Stop-loss at US$340.00, 4.6% below today's close and 70.0% above your average price of US$200.00. Adding 3 shares today would risk €45.")
    expect(held(400)).toMatch(/and 15\.0% below your average price of US\$400\.00\./)
  })

  it('is nothing without a verdict or a plan', () => {
    expect(entrySentence({ verdict: null, price: 356, plan: null })).toBeNull()
    expect(entrySentence({ verdict: null, price: 356, plan }).word).toBeNull()
  })
})
