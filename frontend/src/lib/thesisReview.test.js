import { describe, expect, it } from 'vitest'
import { reviewedLabel } from './thesisReview'

const NOW = new Date('2026-09-25T15:00:00Z')

describe('reviewedLabel', () => {
  it('says never for a thesis with no review', () => {
    expect(reviewedLabel(null, NOW)).toBe('Never reviewed')
  })

  it('says today for a review earlier the same day', () => {
    expect(reviewedLabel('2026-09-25T08:00:00Z', NOW)).toBe('Reviewed today')
  })

  it('says yesterday for a review one day back', () => {
    expect(reviewedLabel('2026-09-24T15:00:00Z', NOW)).toBe('Reviewed yesterday')
  })

  it('counts whole days for anything older', () => {
    expect(reviewedLabel('2026-06-01T15:00:00Z', NOW)).toBe('Reviewed 116 days ago')
  })
})
