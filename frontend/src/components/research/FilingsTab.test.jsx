import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../../test/renderWithProviders'
import FilingsTab from './FilingsTab'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const ok = (data) => ({ data, isLoading: false, error: null, refetch: vi.fn() })

const filingsData = {
  available: true,
  filings: [{ form: '10-K', filed: '2026-02-26', accepted: '', url: 'https://www.sec.gov/a.htm', report_url: '', accession: 'a' }],
}

const insidersData = {
  available: true,
  transactions: [
    { date: '2026-09-12', filed: '2026-09-14', name: 'COXE TENCH', code: 'S', shares: -1500, price: 120.5, value: 180750, holdings: 40000 },
  ],
  summary: { buys: 0, sells: 3, shares_bought: 0, shares_sold: 1200000, value_bought: 0, value_sold: 1e8, insiders: 2, since: '2025-10-01', until: '2026-09-12' },
  sentiment: [{ month: '2026-09', mspr: -64.04, change: -1952 }],
}

beforeEach(() => {
  vi.resetAllMocks()
  queries.useFilings.mockReturnValue(ok(filingsData))
  queries.useInsiders.mockReturnValue(ok(insidersData))
})

describe('FilingsTab', () => {
  it('asks for both datasets for the symbol', () => {
    renderWithProviders(<FilingsTab symbol="NVDA" />)

    expect(queries.useFilings).toHaveBeenCalledWith('NVDA')
    expect(queries.useInsiders).toHaveBeenCalledWith('NVDA')
  })

  it('stacks the three cards', () => {
    renderWithProviders(<FilingsTab symbol="NVDA" />)

    expect(screen.getByRole('heading', { name: 'Insider activity' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Insider transactions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'SEC filings' })).toBeInTheDocument()
  })

  it('states the net activity with its words, the period and the sentiment chart', () => {
    renderWithProviders(<FilingsTab symbol="NVDA" />)

    const sentence = screen.getByText('Insiders sold 1.20M shares net over 3 sales and 0 buys')
    expect(sentence).toHaveClass('text-red-400')
    expect(screen.getByText('01 Oct 2025 to 12 Sep 2026')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Insider sentiment by month' })).toBeInTheDocument()
  })

  it.each([
    [{ shares_bought: 5000, shares_sold: 0, buys: 2, sells: 0 }, 'text-emerald-400'],
    [{ shares_bought: 100, shares_sold: 100, buys: 1, sells: 1 }, 'text-zinc-400'],
  ])('colours the sentence by tone %#', (summary, className) => {
    queries.useInsiders.mockReturnValue(ok({ ...insidersData, summary: { ...insidersData.summary, ...summary } }))
    renderWithProviders(<FilingsTab symbol="NVDA" />)

    expect(screen.getByText(/^Insiders /)).toHaveClass(className)
  })

  it('says nothing was filed when there are no transactions and no sentiment', () => {
    queries.useInsiders.mockReturnValue(ok({ available: true, transactions: [], summary: { ...insidersData.summary, buys: 0, sells: 0 }, sentiment: [] }))
    renderWithProviders(<FilingsTab symbol="NVDA" />)

    expect(screen.getByText('No insider transactions were filed for NVDA in the past year.')).toBeInTheDocument()
  })

  it('shows skeletons while loading, per card', () => {
    queries.useInsiders.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() })
    renderWithProviders(<FilingsTab symbol="NVDA" />)

    expect(screen.getAllByTestId('insiders-loading')).toHaveLength(2)
    expect(screen.queryByTestId('filings-loading')).not.toBeInTheDocument()
    expect(screen.getByText('Annual report')).toBeInTheDocument()
  })

  it('shows the filings loading state on its own', () => {
    queries.useFilings.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() })
    renderWithProviders(<FilingsTab symbol="NVDA" />)

    expect(screen.getByTestId('filings-loading')).toBeInTheDocument()
    expect(screen.getByText(/Insiders sold/)).toBeInTheDocument()
  })

  it('keeps the filings when the insiders request errors, and retries only that query', async () => {
    const refetch = vi.fn()
    queries.useInsiders.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom'), refetch })
    renderWithProviders(<FilingsTab symbol="NVDA" />)

    expect(screen.getAllByText(/could not be loaded/)).toHaveLength(2)
    expect(screen.getByText('Annual report')).toBeInTheDocument()
    const retries = screen.getAllByRole('button', { name: 'Try again' })
    await userEvent.click(retries[0])
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('retries the filings query from its own card', async () => {
    const refetch = vi.fn()
    queries.useFilings.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom'), refetch })
    renderWithProviders(<FilingsTab symbol="NVDA" />)

    expect(screen.getByText(/Insiders sold/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('shows the provider reason or a sentence naming the symbol when unavailable', () => {
    queries.useFilings.mockReturnValue(ok({ available: false, reason: 'Filings are not configured.' }))
    queries.useInsiders.mockReturnValue(ok({ available: false }))
    renderWithProviders(<FilingsTab symbol="NVDA" />)

    expect(screen.getByText('Filings are not configured.')).toBeInTheDocument()
    expect(screen.getByText('Insider activity is unavailable for NVDA.')).toBeInTheDocument()
    expect(screen.getByText('Insider transactions are unavailable for NVDA.')).toBeInTheDocument()
  })

  it('names the symbol when filings are unavailable without a reason', () => {
    queries.useFilings.mockReturnValue(ok({ available: false }))
    renderWithProviders(<FilingsTab symbol="NVDA" />)

    expect(screen.getByText('SEC filings are unavailable for NVDA.')).toBeInTheDocument()
  })
})
