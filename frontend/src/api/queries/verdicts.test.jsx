import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../client')
import * as client from '../client'
import { MAX_VERDICT_TICKERS, useVerdictSummary } from './verdicts'

function setup(useHook, options) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return renderHook(useHook, { wrapper, ...options })
}

describe('useVerdictSummary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks for at most the backend limit per request and merges the answers', async () => {
    const tickers = Array.from({ length: MAX_VERDICT_TICKERS + 5 }, (_, index) => `T${index}`)
    client.getVerdictSummary.mockImplementation(async (chunk) => ({
      verdicts: Object.fromEntries(chunk.map((ticker) => [ticker, ticker === 'T0' ? null : { action: 'hold' }])),
    }))
    const { result } = setup(() => useVerdictSummary(tickers))
    await waitFor(() => expect(Object.keys(result.current.data ?? {})).toHaveLength(tickers.length))
    expect(client.getVerdictSummary.mock.calls.map(([chunk]) => chunk.length)).toEqual([MAX_VERDICT_TICKERS, 5])
    expect(result.current.data.T0).toBeNull()
    expect(result.current.data[`T${MAX_VERDICT_TICKERS + 4}`].action).toBe('hold')
  })

  it('makes no request without tickers', () => {
    const { result } = setup(() => useVerdictSummary([]))
    expect(client.getVerdictSummary).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })
})
