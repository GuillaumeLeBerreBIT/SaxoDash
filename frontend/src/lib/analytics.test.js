import { describe, expect, it } from 'vitest'
import { drawdownDomain, needsDaysNote, pctOrDash, yearTicks } from './analytics'

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
  it('is empty with no rows', () => {
    expect(yearTicks([])).toEqual([])
  })
})
