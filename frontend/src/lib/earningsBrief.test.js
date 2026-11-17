import { describe, expect, it } from 'vitest'

import { earningsHeadline, lastResults, marketSentence, resultWord, whenWords } from './earningsBrief'

const MONDAY = new Date('2026-11-16T10:00:00')
const event = (symbol, date, extra = {}) => ({ symbol, name: `${symbol} Corp`, date, session: 'amc', mine: true, held: true, ...extra })

describe('whenWords', () => {
  it('says today, tomorrow or the weekday, with the session', () => {
    expect(whenWords(event('A', '2026-11-16'), MONDAY)).toBe('today after the close')
    expect(whenWords(event('A', '2026-11-17', { session: 'bmo' }), MONDAY)).toBe('tomorrow before the open')
    expect(whenWords(event('A', '2026-11-19', { session: null }), MONDAY)).toBe('on Thursday')
  })
})

describe('earningsHeadline', () => {
  it('names a single holding and when it reports', () => {
    expect(earningsHeadline([event('NVDA', '2026-11-17', { name: 'NVIDIA' })], null, MONDAY)).toBe('NVIDIA, which you own, reports tomorrow after the close.')
  })

  it('says watch for a stock only on the watchlist', () => {
    expect(earningsHeadline([event('AMD', '2026-11-19', { held: false, name: 'AMD' })], null, MONDAY)).toBe('AMD, which you watch, reports on Thursday after the close.')
  })

  it('lists several in date order', () => {
    const mine = [event('AAPL', '2026-11-19'), event('NVDA', '2026-11-17')]
    expect(earningsHeadline(mine, null, MONDAY)).toBe('Two of your stocks report this week: NVDA tomorrow and AAPL on Thursday.')
  })

  it('points to the next one in a quiet week', () => {
    expect(earningsHeadline([], { symbol: 'NBIS', date: '2026-12-02' }, MONDAY)).toBe('None of your stocks report this week. The next is NBIS on Wed 2 Dec.')
    expect(earningsHeadline([], null, MONDAY)).toBe('None of your stocks report this week.')
  })
})

describe('marketSentence', () => {
  it('counts the week and how many beat so far', () => {
    expect(marketSentence({ total: 218, reported: 41, beat: 16 })).toBe('218 companies report this week; 39% of those already out beat what analysts expected.')
    expect(marketSentence({ total: 218, reported: 0, beat: 0 })).toBe('218 companies report this week.')
    expect(marketSentence(null)).toBeNull()
  })
})

describe('resultWord', () => {
  it('turns the surprise into a word', () => {
    expect(resultWord({ eps_actual: 0.61, eps_surprise_pct: 3.6, date: '2026-11-16' }, MONDAY)).toEqual({ word: 'Beat', tone: 'up' })
    expect(resultWord({ eps_actual: 6.73, eps_surprise_pct: -1.8, date: '2026-11-16' }, MONDAY)).toEqual({ word: 'Missed', tone: 'down' })
    expect(resultWord({ eps_actual: 1, eps_surprise_pct: 0, date: '2026-11-16' }, MONDAY)).toEqual({ word: 'In line', tone: 'flat' })
  })

  it('says due before the report and waiting after it until the figure arrives', () => {
    expect(resultWord({ eps_actual: null, eps_estimate: 2.5, date: '2026-11-17' }, MONDAY)).toEqual({ word: 'Due', tone: 'flat' })
    expect(resultWord({ eps_actual: null, eps_estimate: 2.5, date: '2026-11-13' }, MONDAY)).toEqual({ word: 'Waiting', tone: 'warn' })
  })

  it('has no word without any figure', () => {
    expect(resultWord({ eps_actual: null, eps_estimate: null, date: '2026-11-17' }, MONDAY)).toBeNull()
  })
})

describe('lastResults', () => {
  it('gives the last four reported quarters, oldest first', () => {
    const history = [
      { date: '2025-05-01', eps_actual: 1, eps_surprise_pct: -2 },
      { date: '2025-08-01', eps_actual: 1, eps_surprise_pct: 3 },
      { date: '2025-11-01', eps_actual: 1, eps_surprise_pct: 0 },
      { date: '2026-02-01', eps_actual: 1, eps_surprise_pct: 5 },
      { date: '2026-05-01', eps_actual: 1, eps_surprise_pct: 6 },
      { date: '2026-08-01', eps_actual: null, eps_surprise_pct: null },
    ]
    expect(lastResults(history).map((row) => row.word)).toEqual(['Beat', 'In line', 'Beat', 'Beat'])
  })

  it('is empty without history', () => {
    expect(lastResults(undefined)).toEqual([])
  })
})
