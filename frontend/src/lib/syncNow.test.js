import { describe, expect, it } from 'vitest'
import { latestSyncedAt, syncAdvanced, syncOutcomeNote } from './syncNow'

const status = (kbc, argenta) => ({
  kbc: { connected: true, last_synced_at: kbc },
  argenta: { connected: true, last_synced_at: argenta },
})

describe('latestSyncedAt', () => {
  it('is the newest sync across banks', () => {
    expect(latestSyncedAt(status('2026-10-10T08:00:00Z', '2026-10-10T09:00:00Z'))).toBe('2026-10-10T09:00:00Z')
  })
  it('ignores a bank that never synced', () => {
    expect(latestSyncedAt(status(null, '2026-10-10T09:00:00Z'))).toBe('2026-10-10T09:00:00Z')
  })
  it('is null when nothing ever synced or status is absent', () => {
    expect(latestSyncedAt(status(null, null))).toBeNull()
    expect(latestSyncedAt(undefined)).toBeNull()
  })
})

describe('syncAdvanced', () => {
  it('is true once a newer sync lands', () => {
    expect(syncAdvanced('2026-10-10T08:00:00Z', status('2026-10-10T08:05:00Z', null))).toBe(true)
  })
  it('is false while the newest sync is the one we started from', () => {
    expect(syncAdvanced('2026-10-10T08:00:00Z', status('2026-10-10T08:00:00Z', null))).toBe(false)
  })
  it('is true for the first ever sync', () => {
    expect(syncAdvanced(null, status('2026-10-10T08:00:00Z', null))).toBe(true)
  })
  it('is false when there is still nothing', () => {
    expect(syncAdvanced(null, status(null, null))).toBe(false)
  })
})

describe('syncOutcomeNote', () => {
  it('names the unusable bank and its reason', () => {
    const note = syncOutcomeNote({
      kbc: { connected: true, usable: false, unusable_reason: 'session expired' },
      argenta: { connected: true, usable: true },
    })
    expect(note).toBe('KBC: session expired')
  })
  it('joins several banks', () => {
    const note = syncOutcomeNote({
      kbc: { connected: true, usable: false, unusable_reason: 'session expired' },
      argenta: { connected: true, usable: false, unusable_reason: 'token expired' },
    })
    expect(note).toBe('KBC: session expired · Argenta: token expired')
  })
  it('is empty when every connected bank is usable', () => {
    expect(syncOutcomeNote({ kbc: { connected: true, usable: true }, argenta: { connected: false } })).toBe('')
  })
})
