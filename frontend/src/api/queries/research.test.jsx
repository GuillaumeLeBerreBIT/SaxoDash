import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../client')
import * as client from '../client'
import { researchKeys, useSymbolNote, useSymbolNoteMutation } from './research'

function setup(useHook) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const { result } = renderHook(useHook, { wrapper })
  return { queryClient, result }
}

describe('useSymbolNoteMutation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the new level before the server answers', async () => {
    client.updateSymbolNote.mockReturnValue(new Promise(() => {}))
    const { queryClient, result } = setup(() => useSymbolNoteMutation('NVDA'))
    queryClient.setQueryData(researchKeys.symbolNote('NVDA'), { symbol: 'NVDA', target_price: '100.00' })

    act(() => result.current.mutate({ target_price: '120.00' }))

    await waitFor(() =>
      expect(queryClient.getQueryData(researchKeys.symbolNote('NVDA')).target_price).toBe('120.00'),
    )
  })

  it('goes back to the saved level when the save fails', async () => {
    client.getSymbolNote.mockResolvedValue({ symbol: 'NVDA', target_price: '100.00' })
    client.updateSymbolNote.mockRejectedValue(new Error('boom'))
    const { result } = setup(() => ({ note: useSymbolNote('NVDA'), save: useSymbolNoteMutation('NVDA') }))
    await waitFor(() => expect(result.current.note.data?.target_price).toBe('100.00'))

    act(() => result.current.save.mutate({ target_price: '120.00' }))

    await waitFor(() => expect(result.current.save.isError).toBe(true))
    await waitFor(() => expect(result.current.note.data.target_price).toBe('100.00'))
    expect(client.getSymbolNote).toHaveBeenCalledTimes(2)
  })

  it('goes back to the saved level even when the server cannot be reached', async () => {
    client.getSymbolNote.mockResolvedValueOnce({ symbol: 'NVDA', target_price: '100.00' })
    client.getSymbolNote.mockRejectedValue(new Error('offline'))
    client.updateSymbolNote.mockRejectedValue(new Error('offline'))
    const { result } = setup(() => ({ note: useSymbolNote('NVDA'), save: useSymbolNoteMutation('NVDA') }))
    await waitFor(() => expect(result.current.note.data?.target_price).toBe('100.00'))

    act(() => result.current.save.mutate({ target_price: '120.00' }))

    await waitFor(() => expect(result.current.save.isError).toBe(true))
    await waitFor(() => expect(result.current.note.data.target_price).toBe('100.00'))
  })
})
