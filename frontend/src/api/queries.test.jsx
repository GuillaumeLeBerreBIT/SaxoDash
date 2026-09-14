import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('./client')
import { searchInstruments } from './client'
import { useInstrumentSearch } from './queries'

describe('useInstrumentSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    searchInstruments.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces rapid query changes into a single request', async () => {
    // A fresh client per render (rather than per test) would reset the
    // cache and churn react-query's internals on every keystroke - hoisted
    // once here, the way an app-level QueryClientProvider stays stable.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { rerender } = renderHook(({ query }) => useInstrumentSearch(query), {
      wrapper,
      initialProps: { query: 'i' },
    })

    // Each keystroke of "iShares", arriving faster than the debounce window.
    for (const query of ['is', 'ish', 'isha', 'ishar', 'ishare', 'ishares']) {
      rerender({ query })
      await act(() => vi.advanceTimersByTimeAsync(50))
    }

    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(searchInstruments).toHaveBeenCalledTimes(1)
    expect(searchInstruments).toHaveBeenCalledWith('ishares', 'Stock,Etf')
  })
})
