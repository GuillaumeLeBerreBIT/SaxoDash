import { describe, expect, it } from 'vitest'

import { ACCEL_THRESHOLD_PP } from './earningsInsights'
import { EARNINGS_GUIDE, PLAYBOOKS, QUADRANT_GUIDE, RATIO_GUIDE, SNAPSHOT_GUIDE } from './guide'
import { T } from './snapshot'

describe('SNAPSHOT_GUIDE', () => {
  it('quotes the same thresholds the Snapshot verdicts use, so they cannot drift', () => {
    const growth = SNAPSHOT_GUIDE.find((g) => g.key === 'growth')
    expect(growth.read).toContain(`${T.revFast}%`)
    expect(growth.read).toContain(`${T.epsGap} points`)
  })

  it('has a meaning and a read for every group', () => {
    for (const group of SNAPSHOT_GUIDE) {
      expect(group.meaning.length).toBeGreaterThan(0)
      expect(group.read.length).toBeGreaterThan(0)
    }
  })
})

describe('RATIO_GUIDE', () => {
  it('groups metrics under labelled sections', () => {
    expect(RATIO_GUIDE.map((g) => g.label)).toEqual(['Market', 'Valuation multiples', 'Profitability & health'])
    for (const group of RATIO_GUIDE) {
      expect(group.metrics.length).toBeGreaterThan(0)
    }
  })
})

describe('QUADRANT_GUIDE', () => {
  it('explains all four corners', () => {
    expect(QUADRANT_GUIDE.corners).toHaveLength(4)
  })
})

describe('EARNINGS_GUIDE', () => {
  it('quotes the earningsInsights thresholds, so they cannot drift', () => {
    const trend = EARNINGS_GUIDE.find((e) => e.name === 'Revenue growth trend')
    expect(trend.text).toContain(`${ACCEL_THRESHOLD_PP} points`)
  })
})

describe('PLAYBOOKS', () => {
  it('gives more than one worked combination', () => {
    expect(PLAYBOOKS.length).toBeGreaterThan(1)
  })
})
