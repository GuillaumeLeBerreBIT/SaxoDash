import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../test/renderWithProviders'
import { WIDEST_RANGE_COUNT } from '../lib/research'
import ResearchChart from './ResearchChart'

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

const position = { ticker: 'NVDA', name: 'NVIDIA Corporation', uic: 211, asset_type: 'Stock', qty: 15 }
const tsla = { symbol: 'TSLA', description: 'Tesla Inc', exchange: 'NASDAQ', uic: 9, asset_type: 'Stock' }
const watchlist = {
  id: 1,
  name: 'Tech',
  items: [{ id: 5, symbol: 'TSLA', uic: 9, asset_type: 'Stock', exchange: 'NASDAQ', description: 'Tesla Inc' }],
}

const idle = { data: undefined, isLoading: false, error: null }
let lineMutations

function stubQueries() {
  lineMutations = { create: { mutate: vi.fn() }, update: { mutate: vi.fn() }, remove: { mutate: vi.fn() } }
  queries.usePositions.mockReturnValue({ ...idle, data: [position] })
  queries.useChart.mockReturnValue({ data: bars, isLoading: false, error: null })
  queries.useInstrumentDetails.mockReturnValue({
    ...idle,
    data: { symbol: 'NVDA', description: 'NVIDIA Corporation', exchange: 'NASDAQ', currency: 'USD', uic: 211 },
  })
  queries.useInstrumentSearch.mockImplementation((query) => ({
    ...idle,
    data: query?.toLowerCase().startsWith('ts') ? [tsla] : [],
    isError: false,
  }))
  queries.useQuotes.mockReturnValue({ ...idle, data: [{ uic: 211, price: 875.4, change_pct: 1.42 }] })
  queries.useQuotesByAssetType.mockReturnValue({ data: [], isLoading: false })
  queries.useWatchlists.mockReturnValue({ ...idle, data: [watchlist] })
  queries.useWatchlistMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    rename: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
    addItem: { mutate: vi.fn() },
    removeItem: { mutate: vi.fn() },
  })
  queries.useSaxoStatus.mockReturnValue({ ...idle, data: { connected: true } })
  queries.useSymbolEarnings.mockReturnValue({ ...idle, data: { available: false, reason: 'x' } })
  queries.useSymbolNote.mockReturnValue({ ...idle, data: { symbol: 'NVDA', target_price: '130.00' } })
  queries.useNoteLevelMutation.mockReturnValue({ mutate: vi.fn() })
  queries.usePriceLines.mockReturnValue({ ...idle, data: [] })
  queries.usePriceLineMutations.mockReturnValue(lineMutations)
}

const plot = () => screen.getByTestId('price-scale').closest('svg').parentElement
const backLink = () => screen.getByRole('link', { name: 'Back to Research' })

describe('ResearchChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    stubQueries()
  })

  it('lays out the tool rail, the chart, instrument search and the watchlist', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    expect(screen.getByRole('navigation', { name: 'Chart tools' })).toBeInTheDocument()
    expect(screen.getByTestId('price-scale')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /search instruments/i })).toBeInTheDocument()
    expect(screen.getByText('Tech')).toBeInTheDocument()
  })

  it('fetches the same widest-range chart as Research, so the two views share a cache entry', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    expect(queries.useChart).toHaveBeenLastCalledWith(
      expect.objectContaining({ uic: 211, assetType: 'Stock', count: WIDEST_RANGE_COUNT, horizon: 1440 }),
    )
  })

  it('does not load company fundamentals', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    expect(queries.useFundamentals).not.toHaveBeenCalled()
  })

  it('falls back to the first held position when no symbol is given', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart' })

    expect(backLink()).toHaveAttribute('href', '/research?symbol=NVDA&uic=211&assetType=Stock')
  })

  it('hides the day range in the compact symbol bar', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    expect(screen.queryByText('Day range')).not.toBeInTheDocument()
  })

  it('switches symbol within the chart view from a watchlist row', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: /^TSLA/ }))

    expect(backLink()).toHaveAttribute('href', '/research?symbol=TSLA&uic=9&assetType=Stock')
  })

  it('keeps a search pick in the chart view', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await userEvent.type(screen.getByRole('textbox', { name: /search instruments/i }), 'tsla')
    await userEvent.click(screen.getByText('Tesla Inc'))

    expect(backLink()).toHaveAttribute('href', '/research?symbol=TSLA&uic=9&assetType=Stock')
  })

  it('disables the line tool when the symbol cannot resolve to an instrument', () => {
    queries.usePositions.mockReturnValue({ ...idle, data: [] })
    queries.useInstrumentSearch.mockImplementation(() => ({ ...idle, data: [], isError: false }))
    queries.useInstrumentDetails.mockReturnValue({ ...idle, data: undefined })
    queries.useChart.mockReturnValue({ data: [], isLoading: false, error: null })

    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=ZZZZ' })

    expect(screen.getByRole('button', { name: 'Horizontal line' })).toBeDisabled()
  })

  it('places one line with the armed line tool, then returns to the crosshair', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    fireEvent.mouseDown(plot(), { detail: 1 })
    fireEvent.click(plot(), { detail: 1, clientX: 100, clientY: 120 })

    expect(lineMutations.create.mutate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Crosshair' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('disarms the line tool on Escape without leaving the page', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'Crosshair' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('navigation', { name: 'Chart tools' })).toBeInTheDocument()
  })

  it('does not disarm the line tool when Escape is pressed while typing', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    await userEvent.type(screen.getByRole('textbox', { name: /search instruments/i }), '{Escape}')

    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('disarms the line tool when the symbol changes', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    await userEvent.click(screen.getByRole('button', { name: /^TSLA/ }))

    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('remembers a lower pane turned on here after the page is left and reopened', async () => {
    const first = renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    await userEvent.click(screen.getByRole('button', { name: 'Indicators' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /RSI/ }))
    first.unmount()

    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    expect(screen.getByText(/^RSI 14/)).toBeInTheDocument()
  })
})

describe('ResearchChart panning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    stubQueries()
    queries.useQuotes.mockReturnValue({ ...idle, data: [] })
  })

  it('keeps the header on the latest close while the chart is panned back', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    await userEvent.click(screen.getByRole('button', { name: '1W' }))

    fireEvent.pointerDown(plot(), { clientX: 200, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(plot(), { clientX: 210, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(plot(), { clientX: 500, clientY: 150, pointerId: 1 })
    fireEvent.pointerUp(plot(), { clientX: 500, clientY: 150, pointerId: 1 })

    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeInTheDocument()
    expect(screen.getByText('141.00')).toBeInTheDocument()
  })
})
