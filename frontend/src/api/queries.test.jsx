import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('./client')
import { searchInstruments, updateBankTransactionCategory } from './client'
import { useInstrumentSearch, useUpdateBankTransactionCategory } from './queries'

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

describe('useUpdateBankTransactionCategory', () => {
  it('invalidates bank-transactions by bare prefix, so account-scoped lists refetch too', async () => {
    updateBankTransactionCategory.mockResolvedValue({})

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useUpdateBankTransactionCategory(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 1, category: 'GROCERIES' })
    })

    // A bare ['bank-transactions'] key prefix-matches ['bank-transactions', '?account=5'],
    // the only key AccountTransactions actually queries with - a scoped
    // ['bank-transactions', ''] key would not.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['bank-transactions'] })
    // Same reasoning for spending-summary: Spending.jsx always queries with a
    // '?date_from=...&date_to=...'-scoped key, so a bare prefix is required
    // to invalidate it (a scoped ['spending-summary', ''] key would not).
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['spending-summary'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['spending-trend'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['budget-progress'] })
  })

  it('invalidates a query-scoped spending-summary key, not just the unscoped one', async () => {
    updateBankTransactionCategory.mockResolvedValue({})

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const scopedKey = ['spending-summary', '?date_from=2026-09-01&date_to=2026-09-19']
    queryClient.setQueryData(scopedKey, { total: 100 })
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useUpdateBankTransactionCategory(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 1, category: 'GROCERIES' })
    })

    expect(queryClient.getQueryState(scopedKey).isInvalidated).toBe(true)
  })
})
