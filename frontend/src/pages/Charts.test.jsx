import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectValidHeadingOutline } from '../test/headingOutline'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../test/renderWithProviders'
import { WIDEST_RANGE_COUNT } from '../lib/research'
import Charts from './Charts'

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
  queries.useSectors.mockReturnValue(idle)
  queries.useCharts.mockImplementation((instruments) => ({ data: instruments.map(() => undefined), status: instruments.map(() => 'loading') }))
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
  queries.useVerdictSummary.mockReturnValue(idle)
  queries.useWatchlistMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    rename: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
    addItem: { mutate: vi.fn() },
    removeItem: { mutate: vi.fn() },
  })
  queries.useSaxoStatus.mockReturnValue({ ...idle, data: { connected: true } })
  queries.useSymbolEarnings.mockReturnValue({ ...idle, data: { available: false, reason: 'x' } })
  queries.useFundamentals.mockReturnValue({ ...idle, data: { available: false, reason: 'x' } })
  queries.useVerdict.mockReturnValue(idle)
  queries.useStatements.mockReturnValue({ ...idle, data: { available: false } })
  queries.useSymbolNote.mockReturnValue({ ...idle, data: { symbol: 'NVDA', target_price: '130.00' } })
  queries.useNoteLevelMutation.mockReturnValue({ mutate: vi.fn() })
  queries.usePriceLines.mockReturnValue({ ...idle, data: [] })
  queries.usePriceLineMutations.mockReturnValue(lineMutations)
  queries.useTrendLines.mockReturnValue({ ...idle, data: [] })
  queries.useChartZones.mockReturnValue({ data: [] })
  queries.useChartZoneMutations.mockReturnValue({ create: { mutate: vi.fn() }, remove: { mutate: vi.fn() } })
  queries.useTrendLineMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    update: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  })
  queries.useTextAnnotations.mockReturnValue({ ...idle, data: [] })
  queries.useTextAnnotationMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    update: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  })
}

const nvdaSlot = { symbol: 'NVDA', uic: 211, assetType: 'Stock' }
const tslaSlot = { symbol: 'TSLA', uic: 9, assetType: 'Stock' }
const renderPage = () => renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
const plot = () => screen.getByTestId('price-scale').closest('svg').parentElement
const backLink = () => screen.getByRole('link', { name: 'Back to Research' })
const panes = () => screen.getAllByRole('region', { name: /(chart|^Empty pane( \d)?)$/ })

async function pickLayout(user, label) {
  await user.click(screen.getByRole('button', { name: 'Layout' }))
  await user.click(screen.getByRole('menuitem', { name: label }))
}

const rail = () => screen.getByTestId('chart-watchlist')

describe('Charts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    stubQueries()
  })

  it('gives the sidebar and the watchlist their stored sizes', () => {
    localStorage.setItem('saxodash:chart-rail-width', '420')
    localStorage.setItem('saxodash:chart-watchlist-height', '500')
    const { container } = renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(container.firstChild.style.getPropertyValue('--rail-width')).toBe('420px')
  })

  it('resizes the sidebar from its handle and remembers the width', () => {
    const { container } = renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Sidebar width' }), { key: 'ArrowLeft' })

    expect(container.firstChild.style.getPropertyValue('--rail-width')).toBe('316px')
    expect(localStorage.getItem('saxodash:chart-rail-width')).toBe('316')
  })

  it('shows the whole watchlist in the sidebar, with no scroll area of its own', () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(screen.queryByRole('separator', { name: 'Watchlist height' })).toBeNull()
    expect(screen.getByTestId('chart-watchlist').getAttribute('style')).toBeNull()
  })

  it('offers the watchlist on a phone as its own section under the chart', () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(screen.getByTestId('chart-watchlist-phone')).toHaveClass('lg:hidden')
  })

  it('shows the symbol panel under the watchlist', () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(screen.getByRole('heading', { name: 'Technicals' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open in research/i })).toHaveAttribute(
      'href',
      '/research?symbol=NVDA&uic=211&assetType=Stock',
    )
  })

  it('shows analyst and earnings blocks when the company data is there', () => {
    queries.useFundamentals.mockReturnValue({
      ...idle,
      data: { available: true, market_cap: 3_105_000, recommendation: { period: '2026-09-01', buy: 30, hold: 5 } },
    })
    queries.useSymbolEarnings.mockReturnValue({
      ...idle,
      data: {
        available: true,
        history: [{ date: '2026-06-30', eps_actual: 0.99, eps_estimate: 0.96, eps_surprise_pct: 3.1 }],
        next: null,
        score: null,
      },
    })
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(screen.getByRole('heading', { name: 'Analyst rating' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Earnings' })).toBeInTheDocument()
  })

  it('hands the panel a link to the Financials tab for the same instrument', () => {
    queries.useFundamentals.mockReturnValue({
      ...idle,
      data: {
        available: true,
        annual_results: [
          { label: 'FY 2024', fiscal_year: 2024, revenue: 10e9, net_income: 2e9 },
          { label: 'FY 2025', fiscal_year: 2025, revenue: 12e9, net_income: 3e9 },
        ],
      },
    })
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(screen.getByRole('link', { name: /more financials/i }).getAttribute('href')).toContain('tab=financials')
    expect(queries.useStatements).not.toHaveBeenCalled()
  })

  it('keeps the heading outline valid with the panel mounted', () => {
    const { container } = renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
    expectValidHeadingOutline(container)
  })

  it('renders without a panel when the symbol resolves to nothing', () => {
    queries.usePositions.mockReturnValue({ ...idle, data: [] })
    queries.useInstrumentSearch.mockImplementation(() => ({ ...idle, data: [], isError: false }))
    queries.useInstrumentDetails.mockReturnValue({ ...idle, data: undefined })
    queries.useChart.mockReturnValue({ data: [], isLoading: false, error: null })

    renderWithProviders(<Charts />, { route: '/charts?symbol=ZZZZ' })

    expect(queries.useFundamentals).not.toHaveBeenCalledWith('ZZZZ')
    expect(screen.queryByRole('link', { name: /open in research/i })).not.toBeInTheDocument()
  })

  it('has exactly one h1 and no skipped heading level', () => {
    const { container } = renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
    expectValidHeadingOutline(container)
  })

  it('lays out the tool rail, the chart, instrument search and the watchlist', () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(screen.getByRole('navigation', { name: 'Chart tools' })).toBeInTheDocument()
    expect(screen.getByTestId('price-scale')).toBeInTheDocument()
    expect(within(rail()).getByRole('textbox', { name: 'Search symbol to add' })).toBeInTheDocument()
    expect(within(rail()).getByText('Tech')).toBeInTheDocument()
  })

  it('has one search, which opens a stock or adds it to the list', () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(screen.queryByTestId('instrument-search')).toBeNull()
    expect(within(rail()).getByRole('textbox', { name: 'Search symbol to add' })).toHaveAttribute('placeholder', 'Search a stock to open or add')
  })

  it('fetches the same widest-range chart as Research, so the two views share a cache entry', () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(queries.useChart).toHaveBeenLastCalledWith(
      expect.objectContaining({ uic: 211, assetType: 'Stock', count: WIDEST_RANGE_COUNT, horizon: 1440 }),
    )
  })

  it('loads company fundamentals for the symbol only through the panel', () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(queries.useFundamentals).toHaveBeenCalledWith('NVDA')
  })

  it('falls back to the first held position when no symbol is given', () => {
    renderWithProviders(<Charts />, { route: '/charts' })

    expect(backLink()).toHaveAttribute('href', '/research?symbol=NVDA&uic=211&assetType=Stock')
  })

  it('hides the day range in the compact symbol bar', () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(screen.queryByText('Day range')).not.toBeInTheDocument()
  })

  it('switches symbol within the chart view from a watchlist row', async () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    await userEvent.click(within(rail()).getByRole('button', { name: /^TSLA/ }))

    expect(backLink()).toHaveAttribute('href', '/research?symbol=TSLA&uic=9&assetType=Stock')
  })

  it('keeps a search pick in the chart view', async () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    await userEvent.type(within(rail()).getByRole('textbox', { name: 'Search symbol to add' }), 'tsla')
    await userEvent.click(screen.getByText('Tesla Inc'))

    expect(backLink()).toHaveAttribute('href', '/research?symbol=TSLA&uic=9&assetType=Stock')
  })

  it('disables the line tool when the symbol cannot resolve to an instrument', () => {
    queries.usePositions.mockReturnValue({ ...idle, data: [] })
    queries.useInstrumentSearch.mockImplementation(() => ({ ...idle, data: [], isError: false }))
    queries.useInstrumentDetails.mockReturnValue({ ...idle, data: undefined })
    queries.useChart.mockReturnValue({ data: [], isLoading: false, error: null })

    renderWithProviders(<Charts />, { route: '/charts?symbol=ZZZZ' })

    expect(screen.getByRole('button', { name: 'Horizontal line' })).toBeDisabled()
  })

  it('places one line with the armed line tool, then returns to the crosshair', async () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    fireEvent.mouseDown(plot(), { detail: 1 })
    fireEvent.click(plot(), { detail: 1, clientX: 100, clientY: 120 })

    expect(lineMutations.create.mutate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Crosshair' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('disarms the line tool on Escape without leaving the page', async () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'Crosshair' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('navigation', { name: 'Chart tools' })).toBeInTheDocument()
  })

  it('does not disarm the line tool when Escape is pressed while typing', async () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    await userEvent.type(within(rail()).getByRole('textbox', { name: 'Search symbol to add' }), '{Escape}')

    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('disarms the line tool when the symbol changes', async () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    await userEvent.click(within(rail()).getByRole('button', { name: /^TSLA/ }))

    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('remembers a lower pane turned on here after the page is left and reopened', async () => {
    const first = renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
    await userEvent.click(screen.getByRole('button', { name: 'Indicators' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /RSI/ }))
    first.unmount()

    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(screen.getByText(/^RSI 14/)).toBeInTheDocument()
  })

  it('starts as one chart', () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
    expect(panes()).toHaveLength(1)
  })

  it('does not repeat the symbol bar inside the single pane header', () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
    const pane = screen.getByRole('region', { name: 'NVDA chart' })
    expect(within(pane).queryByText('NVDA')).not.toBeInTheDocument()
    expect(within(pane).queryByText('875.40')).not.toBeInTheDocument()
  })

  it('shows the symbol bar identity in each pane once split', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    await pickLayout(user, 'Side by side')

    const pane = screen.getByRole('region', { name: 'NVDA chart' })
    expect(within(pane).getByText('NVDA')).toBeInTheDocument()
    expect(within(pane).getByText('875.40')).toBeInTheDocument()
  })

  it('splits into four panes with the first new one active and empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    await pickLayout(user, 'Grid of four')

    expect(panes()).toHaveLength(4)
    expect(screen.getByRole('region', { name: 'NVDA chart' })).not.toHaveAttribute('aria-current')
    const empties = screen.getAllByRole('region', { name: /^Empty pane \d$/ })
    expect(empties).toHaveLength(3)
    expect(empties[0]).toHaveAttribute('aria-current', 'true')
    for (const empty of empties) expect(within(empty).queryByText('Volume')).not.toBeInTheDocument()
  })

  it('loads a watchlist pick into the active pane and keeps the other', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    await pickLayout(user, 'Side by side')
    await user.click(within(rail()).getByRole('button', { name: /^TSLA/ }))

    expect(screen.getByRole('region', { name: 'NVDA chart' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'TSLA chart' })).toHaveAttribute('aria-current', 'true')
  })

  it('disables the line tool while the active pane is empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

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
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
    expect(screen.getAllByRole('region', { name: 'NVDA chart' })).toHaveLength(2)
  })

  it('remembers the layout across visits', async () => {
    const user = userEvent.setup()
    const first = renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
    await pickLayout(user, 'Stacked')
    first.unmount()

    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
    expect(panes()).toHaveLength(2)
  })

  it('links panes only in a split layout and saves the choice', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      'saxodash:chart-workspace',
      JSON.stringify({ layout: '2h', slots: [nvdaSlot, tslaSlot], active: 0 }),
    )
    renderPage()
    const toggle = screen.getByRole('button', { name: 'Link panes' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Link panes' })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem('saxodash:chart-workspace')).linked).toBe(true)
  })

  it('offers no Link panes toggle in a single layout even if linked was saved', () => {
    localStorage.setItem(
      'saxodash:chart-workspace',
      JSON.stringify({ layout: '1', slots: [nvdaSlot], active: 0, linked: true }),
    )
    renderPage()
    expect(screen.queryByRole('button', { name: 'Link panes' })).not.toBeInTheDocument()
  })
})

describe('Charts panning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    stubQueries()
    queries.useQuotes.mockReturnValue({ ...idle, data: [] })
  })

  it('keeps the header on the latest close while the chart is panned back', async () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
    await userEvent.click(screen.getByRole('button', { name: '1W' }))

    fireEvent.pointerDown(plot(), { clientX: 200, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(plot(), { clientX: 210, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(plot(), { clientX: 500, clientY: 150, pointerId: 1 })
    fireEvent.pointerUp(plot(), { clientX: 500, clientY: 150, pointerId: 1 })

    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeInTheDocument()
    expect(screen.getByText('141.00')).toBeInTheDocument()
  })

  it('returns a panned pane to the latest bar when the current range is re-picked', async () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
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

describe('Charts time-axis zoom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    stubQueries()
  })

  it('leaves every range unselected while zoomed, and a range pick restores it', async () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
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

  it('lets the range buttons and the connection status wrap instead of clipping', () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(screen.getByRole('button', { name: '1W' }).parentElement.parentElement).toHaveClass('flex-wrap')
  })

  it('fills the dynamic viewport under the app header so the phone toolbar does not clip it', () => {
    const { container } = renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })
    expect(container.firstChild.className).toMatch(/h-\[calc\(100dvh-/)
    expect(container.firstChild).not.toHaveClass('h-dvh')
    expect(container.firstChild).not.toHaveClass('h-screen')
  })

  it('has a way back to Research on every viewport', () => {
    renderWithProviders(<Charts />, { route: '/charts?symbol=NVDA' })

    expect(backLink()).toBeVisible()
  })
})

describe('Charts Compare', () => {
  const sectors = [
    {
      sector: 'Information Technology',
      fund: { ticker: 'XLK', uic: 35417, asset_type: 'Etf' },
      stocks: [{ ticker: 'NVDA' }],
    },
  ]
  const series = (start) => bars.map((bar, i) => ({ ...bar, close: start + i }))
  const byUic = { 36590: series(500), 35417: series(200), 9: series(300) }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    stubQueries()
    queries.useSectors.mockReturnValue({ ...idle, data: { sectors } })
    queries.useCharts.mockImplementation((instruments) => ({
      data: instruments.map((instrument) => byUic[instrument.uic]),
      status: instruments.map(() => 'ok'),
    }))
    queries.usePriceLines.mockReturnValue({ ...idle, data: [{ id: 7, uic: 211, asset_type: 'Stock', price: '120.00' }] })
  })

  const storeWorkspace = (workspace) => localStorage.setItem('saxodash:chart-workspace', JSON.stringify(workspace))
  const stored = () => JSON.parse(localStorage.getItem('saxodash:chart-workspace'))
  const compareToggle = () => screen.getByRole('button', { name: 'Compare' })
  const legend = () => screen.getByTestId('compare-legend')
  const searchDialog = () => screen.getByRole('dialog', { name: 'Add symbol to compare' })

  it('offers the S&P 500 and the Sector Fund by ticker, both off, when Compare is turned on', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(compareToggle())

    expect(compareToggle()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'S&P 500' })).toHaveAttribute('aria-pressed', 'false')
    const fund = screen.getByRole('button', { name: 'XLK' })
    expect(fund).toHaveAttribute('aria-pressed', 'false')
    expect(fund.parentElement).toHaveAttribute('title', expect.stringMatching(/weighted by company size/))
    expect(screen.queryByRole('button', { name: /Information Technology/ })).toBeNull()
  })

  it('draws a chosen line and states where each line ended', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(compareToggle())
    await user.click(screen.getByRole('button', { name: 'S&P 500' }))

    expect(screen.getAllByTestId('compare-line')).toHaveLength(1)
    expect(within(legend()).getByText('+38.2%')).toBeInTheDocument()
    expect(screen.getByTestId('compare-sentence')).toHaveTextContent(
      'Over this window NVDA rose 38.2% and the S&P 500 rose 7.8%.',
    )
  })

  it('hides a line from the chart and the sentence when its name is clicked in the legend', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(compareToggle())
    await user.click(screen.getByRole('button', { name: 'S&P 500' }))
    await user.click(within(legend()).getByRole('button', { name: 'Hide S&P 500' }))

    expect(screen.queryAllByTestId('compare-line')).toHaveLength(0)
    expect(screen.getByTestId('compare-sentence')).toHaveTextContent('Over this window NVDA rose 38.2%.')
  })

  it('hides the S&P 500 button for SPY', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Charts />, { route: '/charts?symbol=SPY&uic=36590&assetType=Etf' })
    await user.click(compareToggle())
    expect(screen.queryByRole('button', { name: 'S&P 500' })).toBeNull()
  })

  it('hides the Sector Fund button for a stock without a Sector', async () => {
    const user = userEvent.setup()
    queries.useSectors.mockReturnValue({ ...idle, data: { sectors: [] } })
    renderPage()
    await user.click(compareToggle())
    expect(screen.queryByRole('button', { name: 'XLK' })).toBeNull()
  })

  it('adds a symbol, refuses a duplicate and frees the slot on removal', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(compareToggle())
    await user.click(screen.getByRole('button', { name: /Add symbol/ }))
    await user.type(screen.getByRole('textbox', { name: 'Search a symbol to compare' }), 'ts')
    await user.click(await within(searchDialog()).findByRole('button', { name: /TSLA/ }))

    expect(within(legend()).getByText('TSLA')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add symbol/ })).toHaveTextContent('2 of 3 left')

    await user.click(screen.getByRole('button', { name: /Add symbol/ }))
    await user.type(screen.getByRole('textbox', { name: 'Search a symbol to compare' }), 'ts')
    expect(await within(searchDialog()).findByRole('button', { name: /TSLA/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Close' }))

    await user.click(within(legend()).getByRole('button', { name: 'Remove TSLA' }))
    expect(screen.getByRole('button', { name: /Add symbol/ })).toHaveTextContent('3 of 3 left')
  })

  it('refuses a fourth added symbol', async () => {
    const user = userEvent.setup()
    const added = [1, 2, 3].map((uic) => ({ symbol: `S${uic}`, uic, assetType: 'Stock' }))
    storeWorkspace({ layout: '1', slots: [nvdaSlot], active: 0, compares: [{ on: true, added }] })
    renderPage()
    const add = screen.getByRole('button', { name: /Add symbol/ })
    expect(add).toBeDisabled()
    expect(add).toHaveTextContent('none left')
    await user.click(add)
    expect(screen.queryByRole('dialog', { name: 'Add symbol to compare' })).toBeNull()
  })

  it('shows drawings read-only on candles and hides them on line', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(compareToggle())
    expect(screen.getAllByTestId(/^price-line-/).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Line' }))
    expect(screen.queryAllByTestId(/^price-line-/)).toHaveLength(0)
    expect(stored().compares[0].mainAs).toBe('line')

    await user.click(screen.getByRole('button', { name: 'Candles' }))
    expect(screen.getAllByTestId(/^price-line-/).length).toBeGreaterThan(0)
  })

  it('greys out the drawing tools while comparing, with a hint to leave Compare', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByRole('button', { name: 'Horizontal line' })).toBeEnabled()
    await user.click(compareToggle())
    const tool = screen.getByRole('button', { name: 'Horizontal line' })
    expect(tool).toBeDisabled()
    expect(tool).toHaveAttribute('title', 'Leave Compare to draw')
  })

  it('keeps Compare after a remount through the stored workspace', async () => {
    const user = userEvent.setup()
    const first = renderPage()
    await user.click(compareToggle())
    await user.click(screen.getByRole('button', { name: 'XLK' }))
    first.unmount()

    renderPage()
    expect(compareToggle()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'XLK' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps separate Compare states for linked panes', async () => {
    const user = userEvent.setup()
    storeWorkspace({ layout: '2h', slots: [nvdaSlot, nvdaSlot], active: 0, linked: true })
    renderPage()
    await user.click(compareToggle())

    expect(screen.getAllByRole('region', { name: 'NVDA chart in Compare' })).toHaveLength(1)
    expect(screen.getAllByRole('region', { name: 'NVDA chart' })).toHaveLength(1)
    expect(stored().compares.map((compare) => compare.on)).toEqual([true, false])
  })
})
