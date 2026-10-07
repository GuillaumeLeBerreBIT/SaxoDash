import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../client')
import * as client from '../client'
import { investorsKeys, useInvestor, useInvestorChanges, useInvestors } from './investors'

function setup(useHook) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return renderHook(useHook, { wrapper })
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
})
