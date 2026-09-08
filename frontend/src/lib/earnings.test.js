import { describe, expect, it } from 'vitest'
import { bucketEarnings, BUCKET_ORDER } from './earnings'

const today = new Date('2026-09-10T12:00:00')
const ev = (date) => ({ symbol: 'X', date })

describe('bucketEarnings', () => {
  it('splits events into recent / this week / next week / later', () => {
    const buckets = bucketEarnings(
      [ev('2026-09-06'), ev('2026-09-10'), ev('2026-09-13'), ev('2026-09-18'), ev('2026-10-01')],
      today,
    )
    expect(buckets.recent.map((e) => e.date)).toEqual(['2026-09-06'])
    expect(buckets.thisWeek.map((e) => e.date)).toEqual(['2026-09-10', '2026-09-13'])
    expect(buckets.nextWeek.map((e) => e.date)).toEqual(['2026-09-18'])
    expect(buckets.later.map((e) => e.date)).toEqual(['2026-10-01'])
  })

  it('treats today as this-week, not recent', () => {
    expect(bucketEarnings([ev('2026-09-10')], today).thisWeek).toHaveLength(1)
  })

  it('exposes a stable display order', () => {
    expect(BUCKET_ORDER.map(([key]) => key)).toEqual(['recent', 'thisWeek', 'nextWeek', 'later'])
  })
})
