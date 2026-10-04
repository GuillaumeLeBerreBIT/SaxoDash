import { describe, expect, it } from 'vitest'

import {
  SCANNING_POLL_MS,
  cardsThatFit,
  discoverPollInterval,
  formatFieldValue,
  healthNotice,
  reasonParts,
  reasonsLine,
  scanEtaLabel,
  scanProgressLabel,
  updatedLabel,
} from './discover'

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

describe('updatedLabel', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  const ago = (ms) => new Date(now.getTime() - ms).toISOString()

  it('says how long ago the last good scan finished', () => {
    expect(updatedLabel(ago(30_000), now)).toBe('Updated just now')
    expect(updatedLabel(ago(5 * 60_000), now)).toBe('Updated 5 min ago')
    expect(updatedLabel(ago(3 * 3_600_000), now)).toBe('Updated 3 h ago')
    expect(updatedLabel(ago(26 * 3_600_000), now)).toBe('Updated 1 day ago')
    expect(updatedLabel(ago(50 * 3_600_000), now)).toBe('Updated 2 days ago')
  })

  it('says so when nothing has been scanned yet', () => {
    expect(updatedLabel(null, now)).toBe('Not scanned yet')
  })
})

describe('healthNotice', () => {
  it('says why the latest scan did not refresh the data', () => {
    expect(healthNotice({ state: 'stale', issue: 'Saxo needs re-authentication.' }, '2026-10-01T17:28:00Z').text)
      .toBe('No fresh scan since 1 Oct. Last attempt: Saxo needs re-authentication.')
    expect(healthNotice({ state: 'failed', issue: 'boom' }, null).text).toBe('The last scan failed. Last attempt: boom')
  })

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

describe('scanEtaLabel', () => {
  const now = new Date('2026-10-04T07:33:45Z')
  const started_at = '2026-10-04T07:23:45Z'

  it('extrapolates the time left from the pace so far', () => {
    expect(scanEtaLabel({ done: 100, total: 518, started_at }, now)).toBe('About 42 min left')
  })

  it('says less than a minute near the end', () => {
    expect(scanEtaLabel({ done: 517, total: 518, started_at }, now)).toBe('Less than a minute left')
  })

  it('has no estimate before there is a pace to measure', () => {
    expect(scanEtaLabel({ done: 0, total: 518, started_at }, now)).toBeNull()
    expect(scanEtaLabel({ done: 0, total: null }, now)).toBeNull()
  })

  it('has no estimate when the scan started after the clock reading', () => {
    expect(scanEtaLabel({ done: 100, total: 518, started_at: '2026-10-04T07:34:45Z' }, now)).toBeNull()
  })

  it('has no estimate for progress reported without a start time', () => {
    expect(scanEtaLabel({ done: 100, total: 518 }, now)).toBeNull()
  })
})

describe('cardsThatFit', () => {
  it('leaves narrow rows to the scroller', () => {
    expect(cardsThatFit(390)).toBeNull()
  })

  it('counts whole cards with their gaps', () => {
    expect(cardsThatFit(944)).toBe(4)
    expect(cardsThatFit(1100)).toBe(4)
    expect(cardsThatFit(1168)).toBe(5)
  })

  it('treats an unmeasured row as narrow rather than empty', () => {
    expect(cardsThatFit(0)).toBeNull()
    expect(cardsThatFit(undefined)).toBeNull()
  })
})

describe('reasonParts', () => {
  it('splits a reason into its label and formatted value', () => {
    expect(reasonParts({ label: 'vs 200D', value: -6.4, format: 'signed_pct' })).toEqual({ label: 'vs 200D', value: '-6.4%' })
  })
})
