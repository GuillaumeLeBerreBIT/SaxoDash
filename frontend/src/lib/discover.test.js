import { describe, expect, it } from 'vitest'

import { SCANNING_POLL_MS, discoverPollInterval, formatShelfMetric, healthNotice } from './discover'

describe('discoverPollInterval', () => {
  it('polls only while the first scan is running', () => {
    expect(discoverPollInterval({ health: { state: 'scanning' } })).toBe(SCANNING_POLL_MS)
    expect(discoverPollInterval({ health: { state: 'ok' } })).toBe(false)
    expect(discoverPollInterval({ health: { state: 'never' } })).toBe(false)
    expect(discoverPollInterval(undefined)).toBe(false)
  })
})

describe('formatShelfMetric', () => {
  it('names the metric that put a stock on the shelf', () => {
    expect(formatShelfMetric('rsi14', 78.4)).toBe('RSI 78')
    expect(formatShelfMetric('pct_vs_ma200', -8.21)).toBe('-8.2% vs 200-day MA')
    expect(formatShelfMetric('change_3m', 12.34)).toBe('+12.3% in 3 months')
    expect(formatShelfMetric('pct_from_52w_high', -1.5)).toBe('-1.5% from 52-week high')
    expect(formatShelfMetric('pe', 11.26)).toBe('P/E 11.3')
    expect(formatShelfMetric('rvol', 2.54)).toBe('2.5× average volume')
  })

  it('renders an absent value as a dash', () => {
    expect(formatShelfMetric('rsi14', null)).toBe('—')
  })
})

describe('healthNotice', () => {
  it('is silent for a healthy scan', () => {
    expect(healthNotice({ state: 'ok' }, '2026-09-30T22:40:00Z')).toBeNull()
  })

  it('says a failed or stale scan out loud', () => {
    expect(healthNotice({ state: 'failed' }, '2026-09-28T22:40:00Z')).toMatchObject({ tone: 'error' })
    expect(healthNotice({ state: 'stale' }, '2026-09-28T22:40:00Z')).toMatchObject({ tone: 'warning' })
  })

  it('does not invent a date when the scan has none', () => {
    expect(healthNotice({ state: 'failed' }, null).text).toBe('The last scan failed.')
    expect(healthNotice({ state: 'stale' }, null).text).toBe('No fresh scan recently.')
  })

  it('explains how to run the first scan', () => {
    expect(healthNotice({ state: 'never' }, null).text).toMatch(/manage\.py scan_universe/)
  })

  it('reports a first scan in progress with how far it got', () => {
    expect(healthNotice({ state: 'scanning', scanned: 144, total: 518 }, null)).toEqual({
      tone: 'info',
      text: 'First scan in progress: 144 of 518 stocks so far. Shelves appear when it finishes.',
    })
  })
})
