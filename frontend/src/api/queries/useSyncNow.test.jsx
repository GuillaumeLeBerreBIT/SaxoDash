import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useSyncNow } from './enablebanking'

vi.mock('../client', () => ({
  getEnableBankingStatus: vi.fn(),
  syncBanksNow: vi.fn(),
}))
import * as client from '../client'

const status = (stamp, extra = {}) => ({
  kbc: { connected: true, usable: true, last_synced_at: stamp, ...extra },
})

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return renderHook(() => useSyncNow(), { wrapper })
}

describe('useSyncNow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.getEnableBankingStatus.mockResolvedValue(status('2026-10-10T08:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('reports a queue failure with the server reason', async () => {
    client.syncBanksNow.mockRejectedValue(new Error('Could not start the sync. Is the worker running?'))
    const { result } = mount()
    await act(async () => { await result.current.syncNow() })
    await waitFor(() => expect(result.current.queueError).toBe('Could not start the sync. Is the worker running?'))
    expect(result.current.syncing).toBe(false)
  })

  it('stays syncing until a newer sync shows up in the bank status', async () => {
    client.syncBanksNow.mockResolvedValue({ queued: true })
    const { result } = mount()
    await waitFor(() => expect(client.getEnableBankingStatus).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current).toBeTruthy())

    vi.useFakeTimers({ shouldAdvanceTime: true })
    await act(async () => { await result.current.syncNow() })
    await waitFor(() => expect(result.current.syncing).toBe(true))

    client.getEnableBankingStatus.mockResolvedValue(status('2026-10-10T08:05:00Z'))
    await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })

    await waitFor(() => expect(result.current.syncing).toBe(false))
    expect(result.current.note).toBe('')
  })

  it('gives up after a minute and says nothing new arrived', async () => {
    client.syncBanksNow.mockResolvedValue({ queued: true })
    const { result } = mount()
    await waitFor(() => expect(client.getEnableBankingStatus).toHaveBeenCalledTimes(1))

    vi.useFakeTimers({ shouldAdvanceTime: true })
    await act(async () => { await result.current.syncNow() })
    await waitFor(() => expect(result.current.syncing).toBe(true))

    await act(async () => { await vi.advanceTimersByTimeAsync(63_000) })

    await waitFor(() => expect(result.current.syncing).toBe(false))
    expect(result.current.note).toBe('No new data yet. The sync may still be running.')
  })

  it('does not take the first status load for a finished sync', async () => {
    client.syncBanksNow.mockResolvedValue({ queued: true })
    const { result } = mount()

    await act(async () => { await result.current.syncNow() })

    await waitFor(() => expect(result.current.syncing).toBe(true))
  })
})
