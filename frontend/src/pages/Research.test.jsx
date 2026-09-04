import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../test/renderWithProviders'
import Research from './Research'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const bars = Array.from({ length: 40 }, (_, i) => ({
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 1_000_000,
}))

const position = {
  ticker: 'NVDA',
  name: 'NVIDIA Corporation',
  uic: 211,
  asset_type: 'Stock',
  qty: 15,
  avg_cost: '412.30',
  value: '13131.00',
  pnl: '6949.50',
  pnl_pct: '112.35',
}

const idle = { data: undefined, isLoading: false, error: null }

function stubQueries({ chart = { data: bars, isLoading: false, error: null }, positions = [position] } = {}) {
  queries.usePositions.mockReturnValue({ ...idle, data: positions })
  queries.useChart.mockReturnValue(chart)
  queries.useInstrumentDetails.mockReturnValue({
    ...idle,
    data: { symbol: 'NVDA', description: 'NVIDIA Corporation', exchange: 'NASDAQ', currency: 'USD', uic: 211 },
  })
  queries.useInstrumentSearch.mockReturnValue({ ...idle, data: [] })
  queries.useQuotes.mockReturnValue({ ...idle, data: [{ uic: 211, price: 875.4, change_pct: 1.42 }] })
  queries.useQuotesByAssetType.mockReturnValue({ data: [], isLoading: false })
  queries.useWatchlists.mockReturnValue({ ...idle, data: [] })
  queries.useWatchlistMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    rename: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
    addItem: { mutate: vi.fn() },
    removeItem: { mutate: vi.fn() },
  })
  queries.useSaxoStatus.mockReturnValue({ ...idle, data: { connected: true } })
}

describe('Research', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubQueries()
  })

  it('shows the symbol from the query string', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=AAPL' })

    expect(screen.getByText('AAPL')).toBeInTheDocument()
  })

  it('falls back to the first held position when no symbol is given', () => {
    renderWithProviders(<Research />, { route: '/research' })

    // NVDA labels both the symbol bar and the instrument card below it.
    expect(screen.getAllByText('NVDA').length).toBeGreaterThan(0)
    expect(screen.getByText('Held')).toBeInTheDocument()
  })

  it('marks an instrument that is in the portfolio as held', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByText('Held')).toBeInTheDocument()
  })

  it('does not mark an instrument that is not held', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=TSLA' })

    expect(screen.queryByText('Held')).not.toBeInTheDocument()
  })

  it('asks Saxo for the candle count that matches the chosen range', async () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: '1Y' }))

    expect(queries.useChart).toHaveBeenLastCalledWith(
      expect.objectContaining({ uic: 211, assetType: 'Stock', count: 252, horizon: 1440 }),
    )
  })

  it('shows the live position card on the overview tab', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByText('Your position')).toBeInTheDocument()
  })

  it('marks valuation as coming soon', async () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Valuation' }))

    expect(screen.getByText(/Valuation — coming soon/)).toBeInTheDocument()
  })

  it('shows a placeholder instead of a chart while the candles load', () => {
    stubQueries({ chart: { data: undefined, isLoading: true, error: null } })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('explains a 409 as a missing Saxo connection rather than a failure', () => {
    stubQueries({
      chart: { data: undefined, isLoading: false, error: Object.assign(new Error('nope'), { status: 409 }) },
    })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByText(/Saxo is not connected/)).toBeInTheDocument()
  })

  it('warns when a symbol cannot be resolved to a Saxo instrument', () => {
    stubQueries({ positions: [] })
    renderWithProviders(<Research />, { route: '/research?symbol=WHAT' })

    expect(screen.getByText(/Could not resolve WHAT/)).toBeInTheDocument()
  })
})
