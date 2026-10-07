import { describe, expect, it } from 'vitest'
import { bankSyncBadge } from './bankSync'

describe('bankSyncBadge', () => {
  it('is green only for an ok sync', () => {
    expect(bankSyncBadge({ last_sync_outcome: 'ok', last_synced_at: '2026-10-05T08:00:00Z', failing_syncs: [] })).toMatchObject({ tone: 'emerald', text: 'connected' })
  })
  it('says why when a sync failed and there has never been a good one', () => {
    const badge = bankSyncBadge({ last_sync_outcome: 'failed', last_synced_at: null, failing_syncs: ['balances'] })
    expect(badge).toMatchObject({ tone: 'amber', text: 'sync failed' })
    expect(badge.title).toContain('never synced')
    expect(badge.title).toContain('failing: balances')
  })
  it('treats a bank that has not synced yet as connected', () => {
    expect(bankSyncBadge({ last_sync_outcome: null, last_synced_at: null, failing_syncs: [] })).toMatchObject({ tone: 'emerald', title: 'Never synced' })
  })
  it('keeps the last good sync in the title of a skipped sync', () => {
    const badge = bankSyncBadge({ last_sync_outcome: 'skipped', last_synced_at: '2026-10-05T08:00:00Z', failing_syncs: [] })
    expect(badge).toMatchObject({ tone: 'amber', text: 'sync skipped' })
    expect(badge.title).toBe('The last sync could not run, so this data may be stale · last good sync 2026-10-05T08:00:00Z')
  })
})
