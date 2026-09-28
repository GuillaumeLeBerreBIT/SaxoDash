import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_CHART_PREFS, readChartPrefs, sanitizeChartPrefs, writeChartPrefs } from './chartPrefs'

const KEY = 'saxodash:chart-prefs'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('sanitizeChartPrefs', () => {
  it('returns the defaults for nothing stored', () => {
    expect(sanitizeChartPrefs(null)).toEqual(DEFAULT_CHART_PREFS)
  })

  it('keeps valid stored values', () => {
    const stored = {
      range: '1Y',
      type: 'line',
      overlays: { ...DEFAULT_CHART_PREFS.overlays, bb: true },
      panes: { ...DEFAULT_CHART_PREFS.panes, macd: true },
    }
    expect(sanitizeChartPrefs(stored)).toEqual(stored)
  })

  it('falls back to the default range and type for values the chart does not know', () => {
    const prefs = sanitizeChartPrefs({ range: '5D', type: 'heikin-ashi' })
    expect(prefs.range).toBe(DEFAULT_CHART_PREFS.range)
    expect(prefs.type).toBe(DEFAULT_CHART_PREFS.type)
  })

  it('drops unknown overlay and pane keys', () => {
    const prefs = sanitizeChartPrefs({ overlays: { ichimoku: true }, panes: { stochastic: true } })
    expect(prefs.overlays).toEqual(DEFAULT_CHART_PREFS.overlays)
    expect(prefs.panes).toEqual(DEFAULT_CHART_PREFS.panes)
  })

  it('gives a toggle missing from an older blob its default', () => {
    const prefs = sanitizeChartPrefs({ overlays: { ma20: false } })
    expect(prefs.overlays).toEqual({ ...DEFAULT_CHART_PREFS.overlays, ma20: false })
  })

  it('falls back to the default for a toggle that is not a boolean', () => {
    const prefs = sanitizeChartPrefs({ panes: { rsi: 'yes' }, overlays: ['ma20'] })
    expect(prefs.panes.rsi).toBe(DEFAULT_CHART_PREFS.panes.rsi)
    expect(prefs.overlays).toEqual(DEFAULT_CHART_PREFS.overlays)
  })
})

describe('readChartPrefs / writeChartPrefs', () => {
  it('round-trips what was written', () => {
    const prefs = { ...DEFAULT_CHART_PREFS, range: '3M', type: 'bars' }
    expect(writeChartPrefs(prefs)).toBe(true)
    expect(readChartPrefs()).toEqual(prefs)
  })

  it('never stores yScale', () => {
    writeChartPrefs({ ...DEFAULT_CHART_PREFS, yScale: 3 })
    expect(JSON.parse(localStorage.getItem(KEY))).not.toHaveProperty('yScale')
  })

  it('reads the defaults from corrupt JSON', () => {
    localStorage.setItem(KEY, '{not json')
    expect(readChartPrefs()).toEqual(DEFAULT_CHART_PREFS)
  })

  it('reads the defaults when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readChartPrefs()).toEqual(DEFAULT_CHART_PREFS)
  })

  it('reports a failed write instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(writeChartPrefs(DEFAULT_CHART_PREFS)).toBe(false)
  })
})
