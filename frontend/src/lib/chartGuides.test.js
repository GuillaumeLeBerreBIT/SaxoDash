import { describe, expect, it } from 'vitest'

import { OUTCOME_SESSIONS, candleMarks, momentumBands, placeBands, placeMarks } from './chartGuides'

const day = (i) => `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`
const bars = (count, close = (i) => 100 + i) =>
  Array.from({ length: count }, (_, i) => ({ date: day(i), open: close(i) - 1, high: close(i) + 2, low: close(i) - 3, close: close(i) }))

const signal = (key, kind, grade) => ({
  key, kind, grade, code: 'XX', label: `Label ${key}`, description: `About ${key}`,
  horizons: { 60: { mean_excess: 0.02, cases: 1000 } },
})
const CATALOGUE = [
  signal('volume_thrust', 'event', 'supported'),
  signal('squeeze_breakout', 'event', 'against'),
  signal('macd_cross_up', 'event', 'no_edge'),
  signal('hammer', 'event', 'unproven'),
  signal('momentum_top', 'rank', 'supported'),
  signal('above_ma200', 'state', 'no_edge'),
]

describe('candleMarks', () => {
  const all = bars(100)

  it('marks only event signals that held up or worked against, with what the stock did next', () => {
    const stock = { events: { volume_thrust: [day(10)], squeeze_breakout: [day(20)], macd_cross_up: [day(5)], hammer: [day(6)], momentum_top: [day(7)] } }
    const marks = candleMarks(stock, CATALOGUE, all)
    expect(marks.map((mark) => [mark.key, mark.side])).toEqual([['volume_thrust', 'below'], ['squeeze_breakout', 'above']])
    const [thrust] = marks
    expect(thrust.entryDate).toBe(day(11))
    expect(thrust.endDate).toBe(day(10 + OUTCOME_SESSIONS))
    expect(thrust.complete).toBe(true)
    expect(thrust.outcomePct).toBeCloseTo(((100 + 70) / (100 + 11 - 1) - 1) * 100, 6)
  })

  it('measures a recent signal up to the latest close and says it is not complete', () => {
    const [mark] = candleMarks({ events: { volume_thrust: [day(90)] } }, CATALOGUE, all)
    expect(mark.complete).toBe(false)
    expect(mark.endDate).toBe(day(99))
    expect(mark.outcomePct).toBeCloseTo((199 / 190 - 1) * 100, 6)
  })

  it('has no outcome for a signal on the latest bar, and skips dates it has no bar for', () => {
    const marks = candleMarks({ events: { volume_thrust: [day(99), '1999-01-01'] } }, CATALOGUE, all)
    expect(marks).toHaveLength(1)
    expect(marks[0].outcomePct).toBeNull()
  })

  it('is empty without signals, a catalogue or bars', () => {
    expect(candleMarks(null, CATALOGUE, all)).toEqual([])
    expect(candleMarks({ events: {} }, undefined, all)).toEqual([])
    expect(candleMarks({ events: { volume_thrust: [day(1)] } }, CATALOGUE, [])).toEqual([])
  })
})

describe('momentumBands', () => {
  it('takes the runs of state and rank signals that held up', () => {
    const stock = { runs: { momentum_top: [[day(1), day(9)]], above_ma200: [[day(0), day(50)]] } }
    expect(momentumBands(stock, CATALOGUE)).toEqual([{ key: 'momentum_top', label: 'Label momentum_top', start: day(1), end: day(9) }])
    expect(momentumBands({}, CATALOGUE)).toEqual([])
    expect(momentumBands(null, CATALOGUE)).toEqual([])
  })
})

describe('placeBands', () => {
  const data = bars(60)
  const band = (start, end) => ({ key: 'momentum_top', label: 'Momentum leader', start, end })

  it('turns dates into bar positions and clips to what is in view', () => {
    expect(placeBands([band('2025-01-01', day(4)), band(day(50), '2027-01-01')], data)).toEqual([
      { key: 'momentum_top', label: 'Momentum leader', from: 0, to: 4 },
      { key: 'momentum_top', label: 'Momentum leader', from: 50, to: 59 },
    ])
  })

  it('joins runs a few sessions apart into one band and drops ones out of view', () => {
    const placed = placeBands([band(day(10), day(14)), band(day(18), day(25)), band(day(40), day(43)), band('2024-01-01', '2024-02-01')], data)
    expect(placed.map((item) => [item.from, item.to])).toEqual([[10, 25], [40, 43]])
  })

  it('leaves out a run of a day or two, unless it is cut off by the edge of the view', () => {
    const placed = placeBands([band('2025-12-01', day(1)), band(day(20), day(21)), band(day(58), '2027-01-01')], data)
    expect(placed.map((item) => [item.from, item.to])).toEqual([[0, 1], [58, 59]])
  })
})

describe('placeMarks', () => {
  const data = bars(60).slice(20)
  const mark = (date, endDate, entryDate) => ({ key: 'volume_thrust', date, entryDate, endDate })

  it('finds each mark\'s candle and where its outcome ends, inside the view', () => {
    const [placed] = placeMarks([mark(day(25), day(40), day(26))], data)
    expect([placed.index, placed.entryIndex, placed.endIndex]).toEqual([5, 6, 20])
  })

  it('drops a mark whose candle is out of view and leaves out an end that is', () => {
    const placed = placeMarks([mark(day(5), day(30), day(6)), mark(day(55), '2027-01-01', day(56))], data)
    expect(placed).toHaveLength(1)
    expect(placed[0].endIndex).toBeNull()
  })
})
