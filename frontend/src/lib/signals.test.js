import { describe, expect, it } from 'vitest'

import {
  GRADE_ORDER, GRADE_WORDS, activeSignals, evidenceLine, groupedByGrade, signalMarkers, signalsForListing, spreadSignalMarkers, standingRows,
} from './signals'

const figures = (mean_excess, cases) => ({ 60: { mean_excess, cases }, 20: { mean_excess: mean_excess / 3, cases } })
const signal = (key, grade, mean_excess, cases, code = key.slice(0, 2).toUpperCase()) => ({
  key, code, label: `Label ${key}`, description: `About ${key}`, kind: 'event', grade,
  horizons: grade ? figures(mean_excess, cases) : {},
})

const MOMENTUM = signal('momentum_top', 'supported', 0.029, 27280, 'MO')
const SQUEEZE = signal('squeeze_breakout', 'against', -0.0236, 1075, 'SQ')
const MACD = signal('macd_cross_up', 'no_edge', 0.0012, 4352, 'MC')
const RARE = signal('rare', 'too_few', 0.2, 120)
const UNTESTED = signal('untested', null)
const ALL = [MOMENTUM, MACD, SQUEEZE, RARE, UNTESTED]

describe('evidenceLine', () => {
  it('states the excess, horizon and cases for a signal that held up', () => {
    expect(evidenceLine(MOMENTUM)).toBe('+2.9% against the average stock over 60 sessions, 27,280 cases')
  })

  it('keeps the minus sign for a signal that worked against', () => {
    expect(evidenceLine(SQUEEZE)).toBe('-2.4% against the average stock over 60 sessions, 1,075 cases')
  })

  it('says no edge without quoting a figure', () => {
    expect(evidenceLine(MACD)).toBe('No edge found in 4,352 cases')
  })

  it('says when there are too few cases', () => {
    expect(evidenceLine(RARE)).toBe('Only 120 cases, too few to judge')
  })

  it('says when nothing has been tested yet', () => {
    expect(evidenceLine(UNTESTED)).toBe('Not tested yet')
  })

  it('can quote another horizon', () => {
    expect(evidenceLine(MOMENTUM, 20)).toBe('+1.0% against the average stock over 20 sessions, 27,280 cases')
  })
})

describe('groupedByGrade', () => {
  it('orders groups by grade, drops empty ones and files ungraded signals under too few', () => {
    const groups = groupedByGrade(ALL)
    expect(groups.map((group) => group.grade)).toEqual(GRADE_ORDER)
    expect(groups[3].signals.map((item) => item.key)).toEqual(['rare', 'untested'])
    expect(groupedByGrade([MACD]).map((group) => group.grade)).toEqual(['no_edge'])
    expect(groupedByGrade(undefined)).toEqual([])
  })

  it('has words for every grade', () => {
    expect(GRADE_ORDER.every((grade) => GRADE_WORDS[grade])).toBe(true)
  })
})

describe('signalMarkers', () => {
  const stock = {
    uic: 211, active: ['momentum_top'],
    events: { momentum_top: ['2026-03-02'], macd_cross_up: ['2026-03-02', '2026-01-05'], squeeze_breakout: ['2026-02-01'] },
  }

  it('lists the chosen signals by date, then in catalogue order', () => {
    const markers = signalMarkers(stock, { momentum_top: true, macd_cross_up: true }, ALL)
    expect(markers.map((marker) => [marker.date, marker.code, marker.grade])).toEqual([
      ['2026-01-05', 'MC', 'no_edge'],
      ['2026-03-02', 'MO', 'supported'],
      ['2026-03-02', 'MC', 'no_edge'],
    ])
    expect(markers[0].label).toBe('Label macd_cross_up')
  })

  it('is empty without a stock answer, a catalogue or a choice', () => {
    expect(signalMarkers(null, { momentum_top: true }, ALL)).toEqual([])
    expect(signalMarkers(stock, { momentum_top: true }, undefined)).toEqual([])
    expect(signalMarkers(stock, {}, ALL)).toEqual([])
    expect(signalMarkers(stock, undefined, ALL)).toEqual([])
  })
})

describe('activeSignals', () => {
  it('lists what is active, signals that held up first', () => {
    const stock = { active: ['macd_cross_up', 'squeeze_breakout', 'momentum_top'] }
    expect(activeSignals(stock, ALL).map((item) => item.key)).toEqual(['momentum_top', 'macd_cross_up', 'squeeze_breakout'])
    expect(activeSignals(null, ALL)).toEqual([])
    expect(activeSignals({ active: [] }, ALL)).toEqual([])
  })
})

describe('signalsForListing', () => {
  it('keeps the signals only for the listing they were computed for', () => {
    const stock = { uic: 211, active: [] }
    expect(signalsForListing(stock, 211)).toBe(stock)
    expect(signalsForListing(stock, '211')).toBe(stock)
    expect(signalsForListing(stock, 999)).toBeNull()
    expect(signalsForListing(stock, undefined)).toBe(stock)
    expect(signalsForListing(null, 211)).toBeNull()
  })
})

describe('spreadSignalMarkers', () => {
  const placed = (index, grade, key = `k${index}`, slot = 0, of = 1) => ({ key, grade, index, slot, of })
  const xAt = (index) => index * 10

  it('keeps every marker when none would touch, left to right', () => {
    const kept = spreadSignalMarkers([placed(5, 'no_edge'), placed(1, 'supported')], xAt, 19)
    expect(kept.map((marker) => [marker.key, marker.x])).toEqual([['k1', 10], ['k5', 50]])
  })

  it('drops the weaker grade when two would overlap, and the older of two equal ones', () => {
    const kept = spreadSignalMarkers(
      [placed(1, 'no_edge'), placed(2, 'supported'), placed(10, 'no_edge'), placed(11, 'no_edge')], xAt, 19,
    )
    expect(kept.map((marker) => marker.key)).toEqual(['k2', 'k11'])
  })

  it('keeps two signals of one day side by side', () => {
    const kept = spreadSignalMarkers([placed(3, 'no_edge', 'a', 0, 2), placed(3, 'no_edge', 'b', 1, 2)], xAt, 19)
    expect(kept.map((marker) => marker.x)).toEqual([20.5, 39.5])
  })
})

describe('standingRows', () => {
  it('words the distance from the high and the momentum with its rank', () => {
    expect(standingRows({ below_high_pct: -12.5, momentum_pct: 40, momentum_rank_pct: 82 })).toEqual([
      { key: 'high', label: 'Against its 1-year high', value: '-12.5%' },
      { key: 'momentum', label: 'Momentum, 12 months skipping the last', value: '+40.0%', note: 'Ahead of 82% of index stocks' },
    ])
  })

  it('says a stock is at its high, and leaves out what is unknown', () => {
    expect(standingRows({ below_high_pct: 0, momentum_pct: null, momentum_rank_pct: null })).toEqual([
      { key: 'high', label: 'Against its 1-year high', value: 'At the high' },
    ])
    expect(standingRows({ below_high_pct: null, momentum_pct: 5, momentum_rank_pct: null })[0].note).toBeNull()
    expect(standingRows(undefined)).toEqual([])
    expect(standingRows({})).toEqual([])
  })
})
