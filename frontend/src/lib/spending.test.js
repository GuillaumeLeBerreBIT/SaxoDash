import { describe, expect, it } from 'vitest'
import { foldSmallSlices, monthLabel, topCategory, trendBars, trendTooltipLabel, trendTooltipRow } from './spending'

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
  it('does not append an Other worth nothing', () => {
    const out = foldSmallSlices([item('A', 100), item('B', 0)])
    expect(out.map((i) => i.name)).toEqual(['A'])
  })
  it('marks the folded slice and leaves real categories unmarked', () => {
    const out = foldSmallSlices([item('A', 90), item('B', 8), item('C', 2)])
    expect(out.at(-1).folded).toBe(true)
    expect(out[0].folded).toBeUndefined()
  })
  it('does not absorb a real category that happens to be named Other', () => {
    const out = foldSmallSlices([item('A', 60), { ...item('Other', 36), category: 'OTHER' }, item('C', 4)])
    expect(out.filter((i) => i.name === 'Other')).toHaveLength(1)
    expect(out.map((i) => i.value)).toEqual([60, 36, 4])
  })
  it('leaves a zero total alone', () => {
    expect(foldSmallSlices([item('A', 0)])).toHaveLength(1)
  })
})

describe('trendBars', () => {
  it('labels months and keeps null totals null', () => {
    expect(trendBars([{ month: '2026-05', total: null, partial: false }, { month: '2026-06', total: '120.00', partial: true }]))
      .toEqual([
        { month: '2026-05', label: "May '26", total: null, partial: false, current: false },
        { month: '2026-06', label: "Jun '26", total: 120, partial: true, current: true },
      ])
  })

  it('marks only the final partial bar as the current month', () => {
    const bars = trendBars([
      { month: '2026-04', total: '10', partial: true },
      { month: '2026-05', total: '20', partial: false },
      { month: '2026-06', total: '30', partial: true },
    ])
    expect(bars.map((b) => b.current)).toEqual([false, false, true])
    expect(bars[0].partial).toBe(true)
  })
})

describe('trendTooltipRow', () => {
  it('says No data for a month without a total', () => {
    expect(trendTooltipRow(null)).toBe('No data')
    expect(trendTooltipRow(undefined)).toBe('No data')
  })
  it('formats a total in euros', () => {
    expect(trendTooltipRow(120)).toContain('120.00')
  })
})

describe('trendTooltipLabel', () => {
  it('adds so far only for the current month', () => {
    expect(trendTooltipLabel("Jun '26", { current: true })).toBe("Jun '26 (so far)")
    expect(trendTooltipLabel("Apr '26", { current: false, partial: true })).toBe("Apr '26")
    expect(trendTooltipLabel("Apr '26", undefined)).toBe("Apr '26")
  })
})
