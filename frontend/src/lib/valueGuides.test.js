import { describe, expect, it } from 'vitest'

import { rollingHigh } from './indicators'
import { entrySentence, guideSeries, visibleGuides } from './valueGuides'

const verdict = (extra = {}) => ({
  action: 'buy', quality: 'strong', valuation: 'fair',
  pe_p25: 20, pe_p75: 30, cheap_below: 80, expensive_above: 120, ...extra,
})
const plan = { stop: { price: 340, source: 'atr' }, stopDistancePct: -4.6, size: { shares: 3, lossAtStop: 45 }, currency: 'USD' }

describe('entrySentence', () => {
  it('keeps the verdict word and why, and describes the usual P/E range as a rule of thumb', () => {
    const s = entrySentence({ verdict: verdict({ action: 'buy', valuation: 'cheap' }), price: 78, currency: 'USD' })
    expect(s.why).toBe('Strong company, P/E below its usual range.')
    expect(s.next).toBe('Its usual P/E of 20 to 30 spans US$80.00 to US$120.00. A rule of thumb, not a buy signal.')
    expect(JSON.stringify(s)).not.toMatch(/cheap|expensive/i)
    expect(JSON.stringify(s)).not.toMatch(/growth|opportunity zone|updates tonight/i)
  })

  it('rounds the P/E to whole numbers', () => {
    expect(entrySentence({ verdict: verdict({ pe_p25: 27.59, pe_p75: 35.91 }), price: 100 }).next).toMatch(/usual P\/E of 28 to 36 spans/)
  })

  it('says when the price cannot be judged', () => {
    const none = 'Too little P/E history to judge the price.'
    expect(entrySentence({ verdict: verdict({ valuation: 'not_judged', cheap_below: null, expensive_above: null }), price: 50 }).next).toBe(none)
    expect(entrySentence({ verdict: verdict({ cheap_below: null }), price: 50 }).next).toBe(none)
  })

  it('shapes the result as word, tone, why, next, risk and earnings', () => {
    expect(entrySentence({ verdict: verdict(), price: 100, plan, currency: 'USD' })).toEqual({
      word: 'PASSES QUALITY SCREEN',
      tone: undefined,
      why: 'Strong company, P/E within its usual range.',
      next: 'Its usual P/E of 20 to 30 spans US$80.00 to US$120.00. A rule of thumb, not a buy signal.',
      risk: "Stop-loss at US$340.00, 4.6% below today's close. Buying 3 shares today would risk €45.",
      earnings: null,
    })
  })

  it('says no valuation yet when not judged', () => {
    expect(entrySentence({ verdict: verdict({ valuation: 'not_judged' }), price: 100 }).why).toBe('Strong company, no valuation yet.')
  })

  it('calls a company with too many missing checks incomplete, not strong', () => {
    expect(entrySentence({ verdict: verdict({ quality: 'incomplete' }), price: 100 }).why).toMatch(/^Incomplete figures on the company,/)
  })

  it('gives only the stop when there is no size', () => {
    expect(entrySentence({ verdict: verdict(), price: 100, plan: { ...plan, size: null } }).risk)
      .toBe("Stop-loss at US$340.00, 4.6% below today's close.")
  })

  it('compares the stop-loss with your average price when you hold the stock', () => {
    const held = (avgCost) => entrySentence({ verdict: verdict({ action: 'hold' }), price: 356, plan: { ...plan, avgCost }, held: true }).risk
    expect(held(200)).toBe("Stop-loss at US$340.00, 4.6% below today's close and 70.0% above your average price of US$200.00. Adding 3 shares today would risk €45.")
    expect(held(400)).toMatch(/and 15\.0% below your average price of US\$400\.00\./)
  })

  it('carries a warning that the company reports soon', () => {
    const soon = 'Reports in 3 days (17 Nov 2026): the price can gap on the news.'
    expect(entrySentence({ verdict: verdict(), price: 356, plan: null, earnings: soon }).earnings).toBe(soon)
    expect(entrySentence({ verdict: null, price: 356, plan: null, earnings: soon }).earnings).toBe(soon)
  })

  it('is nothing without a verdict or a plan', () => {
    expect(entrySentence({ verdict: null, price: 356, plan: null })).toBeNull()
    expect(entrySentence({ verdict: null, price: 356, plan }).word).toBeNull()
  })
})

describe('visibleGuides', () => {
  const day = (i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)
  const full = Array.from({ length: 300 }, (_, i) => ({ date: day(i), open: 100, high: 100 + (i % 7), low: 99, close: 100, volume: 1_000_000 }))
  full[280] = { ...full[280], open: 110, high: 112, low: 109, close: 111, volume: 5_000_000 }

  it('measures the high and the gaps on the full history and maps them to the visible bars', () => {
    const data = full.slice(270, 290)
    const shown = visibleGuides(guideSeries(full, { high: true, gaps: true }), full, data)

    expect(shown.highs).toHaveLength(20)
    expect(shown.highs[0]).toBe(rollingHigh(full)[270])
    expect(shown.gaps).toHaveLength(1)
    expect(shown.gaps[0]).toMatchObject({ index: 10, up: true, from: 100, to: 110 })
  })

  it('leaves out what is switched off and what ended before the visible bars', () => {
    const shown = visibleGuides(guideSeries(full, { high: false, gaps: true }), full, full.slice(281))

    expect(shown.highs).toBeNull()
    expect(shown.gaps[0]).toMatchObject({ index: -1, end: 0, filled: true, filledOn: full[281].date })
    expect(visibleGuides(guideSeries(full, { high: false, gaps: true }), full, full.slice(290)).gaps).toEqual([])
    expect(visibleGuides(guideSeries(full, { high: false, gaps: false }), full, full.slice(290)).gaps).toEqual([])
  })
})
