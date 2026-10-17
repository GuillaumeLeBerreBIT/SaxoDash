import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../client')
import * as client from '../client'
import { MAX_SUMMARY_TICKERS, useCongressOwnershipSummary } from './congress'

function setup(useHook, options) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return renderHook(useHook, { wrapper, ...options })
}

describe('useCongressOwnershipSummary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks for at most the backend limit per request and merges the answers', async () => {
    const tickers = Array.from({ length: MAX_SUMMARY_TICKERS + 5 }, (_, index) => `T${index}`)
    client.getCongressOwnershipSummary.mockImplementation(async (chunk) => ({
      window_days: 90, stocks: Object.fromEntries(chunk.map((ticker) => [ticker, { holders: 1, buyers: 0, sellers: 0 }])),
    }))
    const { result } = setup(() => useCongressOwnershipSummary(tickers))
    await waitFor(() => expect(Object.keys(result.current.data?.stocks ?? {})).toHaveLength(tickers.length))
    expect(client.getCongressOwnershipSummary.mock.calls.map(([chunk]) => chunk.length)).toEqual([MAX_SUMMARY_TICKERS, 5])
    expect(result.current.data.window_days).toBe(90)
  })

  it('keeps showing the previous answer while a changed ticker list loads', async () => {
    client.getCongressOwnershipSummary.mockResolvedValueOnce({ window_days: 90, stocks: { AAPL: { holders: 2, buyers: 1, sellers: 0 } } })
    client.getCongressOwnershipSummary.mockReturnValueOnce(new Promise(() => {}))
    const { result, rerender } = setup(({ tickers }) => useCongressOwnershipSummary(tickers), { initialProps: { tickers: ['AAPL'] } })
    await waitFor(() => expect(result.current.data?.stocks.AAPL.holders).toBe(2))

    rerender({ tickers: ['AAPL', 'MSFT'] })

    await waitFor(() => expect(client.getCongressOwnershipSummary).toHaveBeenCalledTimes(2))
    expect(result.current.data?.stocks.AAPL.holders).toBe(2)
    expect(result.current.isLoading).toBe(false)
  })

  it('makes no request without tickers', () => {
    const { result } = setup(() => useCongressOwnershipSummary([]))
    expect(client.getCongressOwnershipSummary).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })
})
