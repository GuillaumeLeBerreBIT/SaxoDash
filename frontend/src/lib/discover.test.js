import { describe, expect, it } from 'vitest'

import { SCANNING_POLL_MS, discoverPollInterval, formatFieldValue, healthNotice, reasonsLine, scanProgressLabel } from './discover'

describe('discoverPollInterval', () => {
  it('polls while any scan reports progress, first or nightly', () => {
    expect(discoverPollInterval({ health: { state: 'scanning', progress: { done: 0, total: null } } })).toBe(SCANNING_POLL_MS)
    expect(discoverPollInterval({ health: { state: 'ok', progress: { done: 10, total: 518 } } })).toBe(SCANNING_POLL_MS)
  })

  it('stays quiet when nothing is scanning', () => {
    expect(discoverPollInterval({ health: { state: 'ok', progress: null } })).toBe(false)
    expect(discoverPollInterval({ health: { state: 'never', progress: null } })).toBe(false)
    expect(discoverPollInterval(undefined)).toBe(false)
  })
})

describe('scanProgressLabel', () => {
  it('counts stocks once the scan knows its total', () => {
    expect(scanProgressLabel({ done: 144, total: 518 })).toBe('Scanning stocks · 144 of 518')
  })

  it('says the scan is starting before its first stock', () => {
    expect(scanProgressLabel({ done: 0, total: null })).toBe('Starting scan…')
  })
})

describe('formatFieldValue', () => {
  it('formats each kind the backend describes', () => {
    expect(formatFieldValue('number', 78.4)).toBe('78')
    expect(formatFieldValue('pct', 31.24)).toBe('31%')
    expect(formatFieldValue('signed_pct', 14.06)).toBe('+14.1%')
    expect(formatFieldValue('signed_pct', -8.21)).toBe('-8.2%')
    expect(formatFieldValue('ratio', 11.26)).toBe('11.3')
    expect(formatFieldValue('multiple', 2.54)).toBe('2.5×')
  })

  it('renders an absent value as a dash', () => {
    expect(formatFieldValue('pct', null)).toBe('—')
  })
})

describe('reasonsLine', () => {
  it('lists every reason with its label, in order', () => {
    expect(reasonsLine([
      { field: 'roe', label: 'ROE', value: 31.2, format: 'pct' },
      { field: 'pct_vs_ma200', label: 'vs 200D', value: -22.04, format: 'signed_pct' },
      { field: 'pct_from_52w_high', label: 'From high', value: null, format: 'signed_pct' },
    ])).toBe('ROE 31% · vs 200D -22.0% · From high —')
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

  it('says shelves wait for the first scan to finish', () => {
    expect(healthNotice({ state: 'scanning', progress: { done: 144, total: 518 } }, null)).toEqual({
      tone: 'info',
      text: 'First scan in progress. Shelves appear when it finishes.',
    })
  })
})
