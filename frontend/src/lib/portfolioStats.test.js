import { describe, expect, it } from 'vitest'
import { drawdownDomain, needsDaysNote, pctOrDash, yearTicks } from './portfolioStats'

describe('needsDaysNote', () => {
  it('is null when nothing is missing or unknown', () => {
    expect(needsDaysNote(0)).toBeNull()
    expect(needsDaysNote(null)).toBeNull()
    expect(needsDaysNote(undefined)).toBeNull()
  })
  it('pluralises', () => {
    expect(needsDaysNote(1)).toBe('needs 1 more day')
    expect(needsDaysNote(23)).toBe('needs 23 more days')
  })
})

describe('pctOrDash', () => {
  it('never renders a bare unit', () => {
    expect(pctOrDash(null)).toBe('—')
    expect(pctOrDash(12.34)).toBe('12.3%')
    expect(pctOrDash(12.34, 0)).toBe('12%')
    expect(pctOrDash(-0.04)).toBe('0.0%')
    expect(pctOrDash(-0)).toBe('0.0%')
    expect(pctOrDash(NaN)).toBe('—')
  })
})

describe('drawdownDomain', () => {
  it('keeps a minimum span for a flat series', () => {
    expect(drawdownDomain([{ dd: 0 }, { dd: 0 }])).toEqual([-5, 0])
  })
  it('floors a deep drawdown to a whole number', () => {
    expect(drawdownDomain([{ dd: -1 }, { dd: -23.4 }])).toEqual([-24, 0])
  })
  it('survives an empty series', () => {
    expect(drawdownDomain([])).toEqual([-5, 0])
  })
})

describe('yearTicks', () => {
  it('keeps one tick per whole year', () => {
    expect(yearTicks([{ month: 0 }, { month: 6 }, { month: 12 }, { month: 24 }])).toEqual([0, 12, 24])
  })
  it('thins a long horizon to at most maxLabels, keeping month 0', () => {
    const rows = Array.from({ length: 361 }, (_, month) => ({ month }))
    const ticks = yearTicks(rows)
    expect(ticks.length).toBeLessThanOrEqual(11)
    expect(ticks[0]).toBe(0)
    expect(ticks).toEqual([0, 60, 120, 180, 240, 300, 360])
  })
  it('keeps every year at ten years or fewer', () => {
    const rows = Array.from({ length: 121 }, (_, month) => ({ month }))
    expect(yearTicks(rows)).toHaveLength(11)
  })
  it('steps by two when that is enough', () => {
    const rows = Array.from({ length: 217 }, (_, month) => ({ month }))
    expect(yearTicks(rows, 11)).toEqual([0, 24, 48, 72, 96, 120, 144, 168, 192, 216])
  })
  it('is empty with no rows', () => {
    expect(yearTicks([])).toEqual([])
  })
})
