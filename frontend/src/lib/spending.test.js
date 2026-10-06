import { describe, expect, it } from 'vitest'
import { foldSmallSlices, monthLabel, topCategory, trendBars } from './spending'

describe('monthLabel', () => {
  it('formats a year-month', () => {
    expect(monthLabel('2026-06')).toBe("Jun '26")
    expect(monthLabel('2026-12')).toBe("Dec '26")
  })
  it('passes through what it cannot parse', () => {
    expect(monthLabel('')).toBe('')
    expect(monthLabel(undefined)).toBeUndefined()
  })
})

describe('topCategory', () => {
  it('never crowns Other', () => {
    const cats = [{ category: 'OTHER', amount: '900' }, { category: 'GROCERIES', amount: '120' }, { category: 'DINING', amount: '80' }]
    expect(topCategory(cats).category).toBe('GROCERIES')
  })
  it('is undefined when only Other remains or nothing exists', () => {
    expect(topCategory([{ category: 'OTHER', amount: '5' }])).toBeUndefined()
    expect(topCategory([])).toBeUndefined()
    expect(topCategory(undefined)).toBeUndefined()
  })
})

describe('foldSmallSlices', () => {
  const item = (name, value) => ({ name, value, color: '#fff' })
  it('merges slices under the threshold into one Other, last', () => {
    const out = foldSmallSlices([item('A', 90), item('B', 8), item('C', 1), item('D', 1)])
    expect(out.map((i) => i.name)).toEqual(['A', 'B', 'Other'])
    expect(out[2].value).toBe(2)
  })
  it('adds to an existing Other instead of duplicating it', () => {
    const out = foldSmallSlices([item('A', 90), item('Other', 8), item('C', 2)])
    expect(out.filter((i) => i.name === 'Other')).toHaveLength(1)
    expect(out.at(-1).value).toBe(10)
  })
  it('leaves a zero total alone', () => {
    expect(foldSmallSlices([item('A', 0)])).toHaveLength(1)
  })
})

describe('trendBars', () => {
  it('labels months and keeps null totals null', () => {
    expect(trendBars([{ month: '2026-05', total: null, partial: false }, { month: '2026-06', total: '120.00', partial: true }]))
      .toEqual([
        { month: '2026-05', label: "May '26", total: null, partial: false },
        { month: '2026-06', label: "Jun '26", total: 120, partial: true },
      ])
  })
})
