import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../client')
import * as client from '../client'
import {
  researchKeys,
  useNoteLevelMutation,
  usePriceLineMutations,
  usePriceLines,
  useSymbolNote,
} from './research'

function setup(useHook, initialProps) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const { result, rerender } = renderHook(useHook, { wrapper, initialProps })
  return { queryClient, result, rerender }
}

function deferred() {
  let reject
  const promise = new Promise((_, fail) => {
    reject = fail
  })
  return { promise, reject }
}

describe('useNoteLevelMutation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the new level before the server answers', async () => {
    client.updateSymbolNote.mockReturnValue(new Promise(() => {}))
    const { queryClient, result } = setup(() => useNoteLevelMutation('NVDA'))
    queryClient.setQueryData(researchKeys.symbolNote('NVDA'), { symbol: 'NVDA', target_price: '100.00' })

    act(() => result.current.mutate({ target_price: '120.00' }))

    await waitFor(() =>
      expect(queryClient.getQueryData(researchKeys.symbolNote('NVDA')).target_price).toBe('120.00'),
    )
  })

  it('goes back to the saved level when the save fails', async () => {
    client.getSymbolNote.mockResolvedValue({ symbol: 'NVDA', target_price: '100.00' })
    client.updateSymbolNote.mockRejectedValue(new Error('boom'))
    const { result } = setup(() => ({ note: useSymbolNote('NVDA'), save: useNoteLevelMutation('NVDA') }))
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
    const { result } = setup(() => ({ note: useSymbolNote('NVDA'), save: useNoteLevelMutation('NVDA') }))
    await waitFor(() => expect(result.current.note.data?.target_price).toBe('100.00'))

    act(() => result.current.save.mutate({ target_price: '120.00' }))

    await waitFor(() => expect(result.current.save.isError).toBe(true))
    await waitFor(() => expect(result.current.note.data.target_price).toBe('100.00'))
  })
  it('rolls back the instrument it was saved on after switching to another', async () => {
    const save = deferred()
    client.updateSymbolNote.mockReturnValue(save.promise)
    const { queryClient, result, rerender } = setup(({ symbol }) => useNoteLevelMutation(symbol), {
      symbol: 'NVDA',
    })
    queryClient.setQueryData(researchKeys.symbolNote('NVDA'), { symbol: 'NVDA', target_price: '100.00' })
    queryClient.setQueryData(researchKeys.symbolNote('MSFT'), { symbol: 'MSFT', target_price: '300.00' })

    act(() => result.current.mutate({ target_price: '120.00' }))
    await waitFor(() =>
      expect(queryClient.getQueryData(researchKeys.symbolNote('NVDA')).target_price).toBe('120.00'),
    )
    rerender({ symbol: 'MSFT' })
    await act(async () => save.reject(new Error('boom')))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(queryClient.getQueryData(researchKeys.symbolNote('MSFT'))).toEqual({ symbol: 'MSFT', target_price: '300.00' })
    expect(queryClient.getQueryData(researchKeys.symbolNote('NVDA')).target_price).toBe('100.00')
  })
})

describe('price lines', () => {
  beforeEach(() => vi.clearAllMocks())

  const useLines = () => ({ lines: usePriceLines(211, 'Stock'), edit: usePriceLineMutations(211, 'Stock') })

  it('does not fetch until the instrument is known', () => {
    setup(() => usePriceLines(undefined, undefined))

    expect(client.getPriceLines).not.toHaveBeenCalled()
  })

  it('moves a line in the cache before the server answers', async () => {
    client.getPriceLines.mockResolvedValue([{ id: 1, price: '100.00' }])
    client.updatePriceLine.mockReturnValue(new Promise(() => {}))
    const { result } = setup(useLines)
    await waitFor(() => expect(result.current.lines.data).toHaveLength(1))

    act(() => result.current.edit.update.mutate({ id: 1, price: '120.00' }))

    await waitFor(() => expect(result.current.lines.data[0].price).toBe('120.00'))
    expect(client.updatePriceLine).toHaveBeenCalledWith(1, '120.00')
  })

  it('puts a line back when the move fails', async () => {
    client.getPriceLines.mockResolvedValue([{ id: 1, price: '100.00' }])
    client.updatePriceLine.mockRejectedValue(new Error('boom'))
    const { result } = setup(useLines)
    await waitFor(() => expect(result.current.lines.data).toHaveLength(1))

    act(() => result.current.edit.update.mutate({ id: 1, price: '120.00' }))

    await waitFor(() => expect(result.current.edit.update.isError).toBe(true))
    await waitFor(() => expect(result.current.lines.data[0].price).toBe('100.00'))
  })

  it('puts a line back even when the server cannot be reached', async () => {
    client.getPriceLines.mockResolvedValueOnce([{ id: 1, price: '100.00' }])
    client.getPriceLines.mockRejectedValue(new Error('offline'))
    client.updatePriceLine.mockRejectedValue(new Error('offline'))
    const { result } = setup(useLines)
    await waitFor(() => expect(result.current.lines.data).toHaveLength(1))

    act(() => result.current.edit.update.mutate({ id: 1, price: '120.00' }))

    await waitFor(() => expect(result.current.edit.update.isError).toBe(true))
    await waitFor(() => expect(result.current.lines.data[0].price).toBe('100.00'))
  })

  it('removes a line from the cache immediately', async () => {
    client.getPriceLines.mockResolvedValue([{ id: 1, price: '100.00' }, { id: 2, price: '90.00' }])
    client.deletePriceLine.mockReturnValue(new Promise(() => {}))
    const { result } = setup(useLines)
    await waitFor(() => expect(result.current.lines.data).toHaveLength(2))

    act(() => result.current.edit.remove.mutate(1))

    await waitFor(() => expect(result.current.lines.data.map((line) => line.id)).toEqual([2]))
  })

  it('creates a line on the instrument and refetches the list', async () => {
    client.getPriceLines.mockResolvedValue([])
    client.createPriceLine.mockResolvedValue({ id: 3, price: '95.00' })
    const { result } = setup(useLines)
    await waitFor(() => expect(result.current.lines.isSuccess).toBe(true))

    await act(() => result.current.edit.create.mutateAsync({ price: '95.00' }))

    expect(client.createPriceLine).toHaveBeenCalledWith({ uic: 211, assetType: 'Stock', price: '95.00' })
    await waitFor(() => expect(client.getPriceLines).toHaveBeenCalledTimes(2))
  })
  it('rolls back the instrument a move was made on after switching to another', async () => {
    const save = deferred()
    client.updatePriceLine.mockReturnValue(save.promise)
    const { queryClient, result, rerender } = setup(({ uic }) => usePriceLineMutations(uic, 'Stock'), { uic: 211 })
    queryClient.setQueryData(researchKeys.priceLines(211, 'Stock'), [{ id: 1, price: '100.00' }])
    queryClient.setQueryData(researchKeys.priceLines(5, 'Stock'), [{ id: 9, price: '300.00' }])

    act(() => result.current.update.mutate({ id: 1, price: '120.00' }))
    await waitFor(() =>
      expect(queryClient.getQueryData(researchKeys.priceLines(211, 'Stock'))[0].price).toBe('120.00'),
    )
    rerender({ uic: 5 })
    await act(async () => save.reject(new Error('boom')))

    await waitFor(() => expect(result.current.update.isError).toBe(true))
    expect(queryClient.getQueryData(researchKeys.priceLines(5, 'Stock'))).toEqual([{ id: 9, price: '300.00' }])
    expect(queryClient.getQueryData(researchKeys.priceLines(211, 'Stock'))).toEqual([{ id: 1, price: '100.00' }])
  })
})
