import { describe, expect, it } from 'vitest'
import { yoyGrowthSeries, buildEarningsInsights } from './earningsInsights'

describe('yoyGrowthSeries', () => {
  it('is null for the first four entries', () => {
    const out = yoyGrowthSeries([1, 2, 3, 4, 5])
    expect(out.slice(0, 4)).toEqual([null, null, null, null])
  })

  it('computes percent change against the same index four back', () => {
    const out = yoyGrowthSeries([10, 0, 0, 0, 11])
    expect(out[4]).toBeCloseTo(10, 5)
  })

  it('is null when the anchor is zero or null', () => {
    expect(yoyGrowthSeries([0, 0, 0, 0, 5])[4]).toBeNull()
    expect(yoyGrowthSeries([null, 0, 0, 0, 5])[4]).toBeNull()
  })
})

function row(period, eps, revPerShare, margins = {}) {
  return {
    period, eps, revenue_per_share: revPerShare,
    gross_margin: margins.gross ?? null, net_margin: margins.net ?? null,
    operating_margin: margins.operating ?? null,
  }
}

// 10 quarters, index 0-9. The margin YoY comparison reads index 9 (latest)
// against index 5 (latest - 4), so operating_margin is set at exactly those
// two indices - 27 -> 31, a +4pp expansion.
const ACCEL_TRENDS = [
  row('2024-Q1', 1.0, 8.0), row('2024-Q2', 1.0, 8.0), row('2024-Q3', 1.0, 8.0), row('2024-Q4', 1.0, 8.0),
  row('2025-Q1', 1.1, 10.0), row('2025-Q2', 1.1, 10.0, { operating: 27 }), row('2025-Q3', 1.1, 10.0), row('2025-Q4', 1.1, 10.0),
  row('2026-Q1', 1.3, 11.0),
  row('2026-Q2', 1.6, 12.5, { operating: 31 }),
]

describe('buildEarningsInsights', () => {
  it('returns [] when there are fewer than 8 quarters', () => {
    expect(buildEarningsInsights(ACCEL_TRENDS.slice(0, 5))).toEqual([])
  })

  it('returns [] without a trends array', () => {
    expect(buildEarningsInsights(null)).toEqual([])
    expect(buildEarningsInsights(undefined)).toEqual([])
  })

  it('reports acceleration when the YoY rate rises enough', () => {
    const insights = buildEarningsInsights(ACCEL_TRENDS)
    const accel = insights.find((i) => i.text.includes('accelerated'))
    expect(accel).toBeTruthy()
    expect(accel.tone).toBe('pos')
  })

  it('reports deceleration when the YoY rate falls enough', () => {
    const decel = [...ACCEL_TRENDS]
    decel[9] = row('2026-Q2', 1.15, 10.2, { operating: 29 })   // YoY drops back toward ~2%
    const insights = buildEarningsInsights(decel)
    const found = insights.find((i) => i.text.includes('decelerated'))
    expect(found).toBeTruthy()
    expect(found.tone).toBe('caution')
  })

  it('reports EPS outrunning revenue-per-share as margin expansion', () => {
    const insights = buildEarningsInsights(ACCEL_TRENDS)
    // EPS YoY at index 9: (1.6-1.1)/1.1 ≈ 45%; revenue-per-share YoY ≈ 25% -> gap > 5pp
    const gap = insights.find((i) => i.text.includes('margin expansion'))
    expect(gap).toBeTruthy()
    expect(gap.tone).toBe('pos')
  })

  it('reports an operating-margin expansion year over year', () => {
    const insights = buildEarningsInsights(ACCEL_TRENDS)
    const margin = insights.find((i) => i.text.includes('Operating margin expanded'))
    expect(margin).toBeTruthy()
  })

  it('falls back to net margin when operating margin is unavailable at both endpoints', () => {
    const noOperating = ACCEL_TRENDS.map((r) => ({ ...r, operating_margin: null }))
    noOperating[5] = { ...noOperating[5], net_margin: 20 }   // latest - 4
    noOperating[9] = { ...noOperating[9], net_margin: 24 }   // latest
    const insights = buildEarningsInsights(noOperating)
    expect(insights.some((i) => i.text.includes('Net margin expanded'))).toBe(true)
  })
})
