import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
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
  queries.useTrendLines.mockReturnValue({ ...idle, data: [] })
  queries.useTrendLineMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    update: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  })
}

const plot = () => screen.getByTestId('price-scale').closest('svg').parentElement
const backLink = () => screen.getByRole('link', { name: 'Back to Research' })
const panes = () => screen.getAllByRole('region', { name: /chart$/ })

async function pickLayout(user, label) {
  await user.click(screen.getByRole('button', { name: 'Layout' }))
  await user.click(screen.getByRole('menuitem', { name: label }))
}

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

  it('starts as one chart', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    expect(panes()).toHaveLength(1)
  })

  it('does not repeat the symbol bar inside the single pane header', () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    const pane = screen.getByRole('region', { name: 'NVDA chart' })
    expect(within(pane).queryByText('NVDA')).not.toBeInTheDocument()
    expect(within(pane).queryByText('875.40')).not.toBeInTheDocument()
  })

  it('shows the symbol bar identity in each pane once split', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await pickLayout(user, 'Side by side')

    const pane = screen.getByRole('region', { name: 'NVDA chart' })
    expect(within(pane).getByText('NVDA')).toBeInTheDocument()
    expect(within(pane).getByText('875.40')).toBeInTheDocument()
  })

  it('splits into four panes with the first new one active and empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await pickLayout(user, 'Grid of four')

    expect(panes()).toHaveLength(4)
    expect(screen.getByRole('region', { name: 'NVDA chart' })).not.toHaveAttribute('aria-current')
    const empties = screen.getAllByRole('region', { name: 'Empty chart' })
    expect(empties).toHaveLength(3)
    expect(empties[0]).toHaveAttribute('aria-current', 'true')
  })

  it('loads a watchlist pick into the active pane and keeps the other', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await pickLayout(user, 'Side by side')
    await user.click(screen.getByRole('button', { name: /^TSLA/ }))

    expect(screen.getByRole('region', { name: 'NVDA chart' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'TSLA chart' })).toHaveAttribute('aria-current', 'true')
  })

  it('disables the line tool while the active pane is empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })

    await pickLayout(user, 'Stacked')

    expect(screen.getByRole('button', { name: 'Horizontal line' })).toBeDisabled()
  })

  it('shows the same instrument in two panes', () => {
    localStorage.setItem(
      'saxodash:chart-workspace',
      JSON.stringify({
        layout: '2h',
        slots: [
          { symbol: 'NVDA', uic: 211, assetType: 'Stock' },
          { symbol: 'NVDA', uic: 211, assetType: 'Stock' },
        ],
        active: 0,
      }),
    )
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    expect(screen.getAllByRole('region', { name: 'NVDA chart' })).toHaveLength(2)
  })

  it('remembers the layout across visits', async () => {
    const user = userEvent.setup()
    const first = renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    await pickLayout(user, 'Stacked')
    first.unmount()

    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    expect(panes()).toHaveLength(2)
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

  it('returns a panned pane to the latest bar when the current range is re-picked', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    await userEvent.click(screen.getByRole('button', { name: '1W' }))

    fireEvent.pointerDown(plot(), { clientX: 200, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(plot(), { clientX: 210, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(plot(), { clientX: 500, clientY: 150, pointerId: 1 })
    fireEvent.pointerUp(plot(), { clientX: 500, clientY: 150, pointerId: 1 })
    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '1W' }))

    expect(screen.queryByRole('button', { name: 'Jump to latest' })).not.toBeInTheDocument()
  })
})

describe('ResearchChart time-axis zoom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    stubQueries()
  })

  it('leaves every range unselected while zoomed, and a range pick restores it', async () => {
    renderWithProviders(<ResearchChart />, { route: '/research/chart?symbol=NVDA' })
    const axis = screen.getByTestId('time-axis')

    fireEvent.pointerDown(axis, { clientX: 300, clientY: 5, pointerId: 1 })
    fireEvent.pointerMove(axis, { clientX: 310, clientY: 5, pointerId: 1 })
    fireEvent.pointerMove(axis, { clientX: 460, clientY: 5, pointerId: 1 })
    fireEvent.pointerUp(axis, { clientX: 460, clientY: 5, pointerId: 1 })

    for (const range of ['1W', '1M', '3M', '6M', '1Y', 'ALL']) {
      expect(screen.getByRole('button', { name: range })).toHaveAttribute('aria-pressed', 'false')
    }

    await userEvent.click(screen.getByRole('button', { name: '1M' }))
    expect(screen.getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'true')
  })
})
