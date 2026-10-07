import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../client')
import * as client from '../client'
import {
  investorsKeys, useAddInvestor, useFollowInvestor, useInvestor, useInvestorChanges, useInvestorHub,
  useInvestors, useInvestorSearch, useInvestorStocks, useStopTracking,
} from './investors'

function setup(useHook, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { ...renderHook(useHook, { wrapper }), queryClient }
}

describe('investor queries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists every investor without a holds filter', async () => {
    client.getInvestors.mockResolvedValue([{ slug: 'berkshire-hathaway' }])
    const { result } = setup(() => useInvestors())
    await waitFor(() => expect(result.current.data).toEqual([{ slug: 'berkshire-hathaway' }]))
    expect(client.getInvestors).toHaveBeenCalledWith('')
  })

  it('asks for holders of a ticker as its own query', async () => {
    client.getInvestors.mockResolvedValue([])
    const { result } = setup(() => useInvestors({ holds: 'AAPL' }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getInvestors).toHaveBeenCalledWith('AAPL')
    expect(investorsKeys.list('AAPL')).not.toEqual(investorsKeys.list(''))
  })

  it('loads one investor for the asked quarter', async () => {
    client.getInvestor.mockResolvedValue({ slug: 'berkshire-hathaway' })
    const { result } = setup(() => useInvestor('berkshire-hathaway', '2026-03-31'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getInvestor).toHaveBeenCalledWith('berkshire-hathaway', '2026-03-31')
  })

  it('waits for a slug before loading an investor', () => {
    setup(() => useInvestor(null))
    expect(client.getInvestor).not.toHaveBeenCalled()
  })

  it('loads the changes for a quarter', async () => {
    client.getInvestorChanges.mockResolvedValue({ new: [] })
    const { result } = setup(() => useInvestorChanges('berkshire-hathaway'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getInvestorChanges).toHaveBeenCalledWith('berkshire-hathaway', undefined)
  })

  it('loads the hub in one request', async () => {
    client.getInvestorHub.mockResolvedValue({ shelves: [] })
    const { result } = setup(() => useInvestorHub())
    await waitFor(() => expect(result.current.data).toEqual({ shelves: [] }))
    expect(client.getInvestorHub).toHaveBeenCalledTimes(1)
  })

  it('keys stock activity on view and quarter', async () => {
    client.getInvestorStocks.mockResolvedValue({ rows: [] })
    const { result } = setup(() => useInvestorStocks('sold', '2026-03-31'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getInvestorStocks).toHaveBeenCalledWith('sold', '2026-03-31')
    expect(investorsKeys.stocks('sold')).not.toEqual(investorsKeys.stocks('bought'))
  })

  it('does not search EDGAR for fewer than three characters', () => {
    setup(() => useInvestorSearch('ab'))
    expect(client.searchFilers).not.toHaveBeenCalled()
  })

  it('searches once the query is long enough', async () => {
    client.searchFilers.mockResolvedValue([{ cik: 1 }])
    const { result } = setup(() => useInvestorSearch('pershing'))
    await waitFor(() => expect(result.current.data).toEqual([{ cik: 1 }]))
  })

  it('flips the star before the server answers and keeps it on success', async () => {
    let finish
    client.setInvestorFollowed.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const { result, queryClient } = setup(() => useFollowInvestor())
    queryClient.setQueryData(investorsKeys.list(), [{ slug: 'a', followed: false }, { slug: 'b', followed: false }])
    queryClient.setQueryData(investorsKeys.detail('a'), { slug: 'a', followed: false })

    result.current.mutate({ slug: 'a', followed: true })

    await waitFor(() => expect(queryClient.getQueryData(investorsKeys.list())[0].followed).toBe(true))
    expect(queryClient.getQueryData(investorsKeys.list())[1].followed).toBe(false)
    expect(queryClient.getQueryData(investorsKeys.detail('a')).followed).toBe(true)
    finish({ slug: 'a', followed: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.setInvestorFollowed).toHaveBeenCalledWith('a', true)
  })

  it('puts the star back when following fails', async () => {
    client.setInvestorFollowed.mockRejectedValue(new Error('offline'))
    client.getInvestors.mockResolvedValue([{ slug: 'a', followed: false }])
    const { result, queryClient } = setup(() => useFollowInvestor())
    queryClient.setQueryData(investorsKeys.list(), [{ slug: 'a', followed: false }])

    result.current.mutate({ slug: 'a', followed: true })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(queryClient.getQueryData(investorsKeys.list())[0].followed).toBe(false)
  })

  it('refreshes the directory and the hub after adding or removing an investor', async () => {
    client.addInvestor.mockResolvedValue({ slug: 'new' })
    client.stopTrackingInvestor.mockResolvedValue(null)
    const added = setup(() => useAddInvestor())
    const spy = vi.spyOn(added.queryClient, 'invalidateQueries')
    added.result.current.mutate(1336528)
    await waitFor(() => expect(added.result.current.isSuccess).toBe(true))
    expect(client.addInvestor).toHaveBeenCalledWith(1336528)
    expect(spy).toHaveBeenCalledWith({ queryKey: ['investors'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: investorsKeys.hub })

    const stopped = setup(() => useStopTracking())
    stopped.result.current.mutate('new')
    await waitFor(() => expect(stopped.result.current.isSuccess).toBe(true))
    expect(client.stopTrackingInvestor).toHaveBeenCalledWith('new')
  })
})
