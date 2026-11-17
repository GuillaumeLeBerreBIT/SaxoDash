import { describe, expect, it } from 'vitest'

import { rollingHigh } from './indicators'
import { entrySentence, FAIR_BAND, growthSentence, guideSeries, peChip, readPrice, stepAt, visibleGuides } from './valueGuides'

const step = { from: '2026-08-30', price: 100, pe: 24, growth: 24.1, eps_ttm: 4.17, capped: false }
const capped = { ...step, pe: 30, growth: 167.4, capped: true }
const verdict = (extra = {}) => ({ action: 'wait', quality: 'strong', valuation: 'fair', growth_line: [step], ...extra })
const plan = { stop: { price: 340, source: 'atr' }, stopDistancePct: -4.6, size: { shares: 3, lossAtStop: 45 }, currency: 'USD' }

describe('readPrice', () => {
  it('reads cheap, fair and expensive around a 10% band', () => {
    expect(FAIR_BAND).toBe(0.1)
    expect(readPrice(89, step)).toBe('cheap')
    expect(readPrice(91, step)).toBe('fair')
    expect(readPrice(109, step)).toBe('fair')
    expect(readPrice(111, step)).toBe('expensive')
  })

  it('never calls a capped line expensive', () => {
    expect(readPrice(89, capped)).toBe('cheap')
    expect(readPrice(150, capped)).toBe('priced_in')
  })

  it('reads nothing without a price or a step', () => {
    expect(readPrice(null, step)).toBeNull()
    expect(readPrice(100, null)).toBeNull()
  })
})

describe('stepAt', () => {
  it('finds the step covering a date and nothing before the first', () => {
    const line = [{ ...step, from: '2026-01-10' }, { ...step, from: '2026-04-10', price: 120 }]
    expect(stepAt(line, '2026-01-09')).toBeNull()
    expect(stepAt(line, '2026-04-09').price).toBe(100)
    expect(stepAt(line, '2026-05-01').price).toBe(120)
    expect(stepAt([], '2026-05-01')).toBeNull()
    expect(stepAt(null, '2026-05-01')).toBeNull()
  })
})

describe('peChip', () => {
  it('places the P/E against its usual range', () => {
    const base = { valuation: 'cheap', pe_p25: 45, pe_p75: 77 }
    expect(peChip({ ...base, current_pe: 19.8 })).toEqual({ pe: 19.8, low: 45, high: 77, position: 'below' })
    expect(peChip({ ...base, current_pe: 60 }).position).toBe('inside')
    expect(peChip({ ...base, current_pe: 90 }).position).toBe('above')
  })

  it('is nothing when not judged or a figure is missing', () => {
    expect(peChip({ valuation: 'not_judged', current_pe: 19.8, pe_p25: 45, pe_p75: 77 })).toBeNull()
    expect(peChip({ valuation: 'fair', current_pe: null, pe_p25: 45, pe_p75: 77 })).toBeNull()
    expect(peChip({ valuation: 'fair', current_pe: 20, pe_p25: null, pe_p75: 77 })).toBeNull()
    expect(peChip(null)).toBeNull()
  })
})

describe('growthSentence', () => {
  it('words the growth line, capped or not', () => {
    expect(growthSentence(step, 118, 'USD')).toBe('Against its growth: earnings grew 24% a year over three years, which supports a P/E of 24, about US$100.00. Price is +18% from that line, so expensive.')
    expect(growthSentence(step, 108, 'USD')).toMatch(/Price is \+8% from that line, so fair\.$/)
    expect(growthSentence(capped, 66, 'USD')).toBe('Against its growth: earnings grew 167% a year, more than a P/E of 30 assumes. At P/E 30 that is about US$100.00; price is 34% below it, so cheap even on that floor.')
  })

  it('says a capped line above the floor is priced in, without an instruction', () => {
    const text = growthSentence(capped, 150, 'USD')
    expect(text).toMatch(/price is 50% above it, so its growth is priced in\.$/)
    expect(text).not.toMatch(/buy|sell|opportunity/i)
  })
})

describe('growthSentence edge cases', () => {
  it('words a capped price slightly under the line as below it', () => {
    expect(growthSentence(capped, 95, 'USD')).toMatch(/price is 5% below it, so its growth is priced in\.$/)
  })

  it('describes the line without a comparison when there is no price', () => {
    for (const price of [null, undefined, NaN]) {
      expect(growthSentence(step, price, 'USD')).toBe('Against its growth: earnings grew 24% a year over three years, which supports a P/E of 24, about US$100.00.')
      expect(growthSentence(capped, price, 'USD')).toBe('Against its growth: earnings grew 167% a year, more than a P/E of 30 assumes. At P/E 30 that is about US$100.00.')
    }
    expect(entrySentence({ verdict: verdict(), price: null }).next).not.toMatch(/−100|NaN|null/)
  })
})

describe('entrySentence', () => {
  it('keeps the verdict word and why, and puts the growth view in next', () => {
    const s = entrySentence({ verdict: verdict({ action: 'buy', valuation: 'cheap' }), price: 118, currency: 'USD' })
    expect(s.why).toBe('Strong company, cheap price.')
    expect(s.next).toMatch(/^Against its growth/)
    expect(JSON.stringify(s)).not.toMatch(/opportunity zone|updates tonight/i)
  })

  it('says when there is no growth line', () => {
    expect(entrySentence({ verdict: verdict({ quality: 'mixed', growth_line: [] }), price: 50 }).next)
      .toBe('Too little earnings history for a growth line.')
    expect(entrySentence({ verdict: verdict({ growth_line: null }), price: 50 }).next)
      .toBe('Too little earnings history for a growth line.')
  })

  it('has no growth view when the line starts in the future', () => {
    const future = { ...step, from: '2999-01-01' }
    expect(entrySentence({ verdict: verdict({ growth_line: [future] }), price: 50 }).next)
      .toBe('Too little earnings history for a growth line.')
  })

  it('shapes the result as word, tone, why, next, risk and earnings', () => {
    expect(entrySentence({ verdict: verdict(), price: 100, plan, currency: 'USD' })).toEqual({
      word: 'WAIT',
      tone: undefined,
      why: 'Strong company, fair price.',
      next: 'Against its growth: earnings grew 24% a year over three years, which supports a P/E of 24, about US$100.00. Price is +0% from that line, so fair.',
      risk: "Stop-loss at US$340.00, 4.6% below today's close. Buying 3 shares today would risk €45.",
      earnings: null,
    })
  })

  it('says no valuation yet when not judged', () => {
    expect(entrySentence({ verdict: verdict({ valuation: 'not_judged' }), price: 100 }).why).toBe('Strong company, no valuation yet.')
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
