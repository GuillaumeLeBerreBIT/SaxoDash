import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, Route, Routes } from 'react-router-dom'

import { renderWithProviders } from '../test/renderWithProviders'
import { expectValidHeadingOutline } from '../test/headingOutline'
import Boards from './Boards'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const idle = { data: undefined, isLoading: false, error: null }
const bars = Array.from({ length: 40 }, (_, i) => ({
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 1_000_000,
}))
const position = { ticker: 'NVDA', name: 'NVIDIA Corporation', uic: 211, asset_type: 'Stock', qty: 15, value: '1000', weight: '10' }
const watchlist = {
  id: 1,
  name: 'Tech',
  items: [
    { id: 5, symbol: 'TSLA', uic: 9, asset_type: 'Stock', exchange: 'NASDAQ', description: 'Tesla Inc' },
    { id: 6, symbol: 'NVDA', uic: 211, asset_type: 'Stock', exchange: 'NASDAQ', description: 'NVIDIA' },
  ],
}
const mutations = () => ({ create: { mutate: vi.fn() }, update: { mutate: vi.fn() }, remove: { mutate: vi.fn() } })

function stubQueries() {
  queries.usePositions.mockReturnValue({ ...idle, data: [position] })
  queries.usePositionQuotes.mockReturnValue(new Map())
  queries.useChart.mockReturnValue({ data: bars, isLoading: false, error: null })
  queries.useInstrumentDetails.mockReturnValue({
    ...idle,
    data: { symbol: 'NVDA', description: 'NVIDIA Corporation', exchange: 'NASDAQ', currency: 'USD', uic: 211 },
  })
  queries.useInstrumentSearch.mockReturnValue({ ...idle, data: [], isError: false })
  queries.useQuotes.mockReturnValue({ ...idle, data: [] })
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
  queries.useFundamentals.mockReturnValue({ ...idle, data: { available: false, reason: 'x' } })
  queries.useSymbolNote.mockReturnValue({ ...idle, data: null })
  queries.useNoteLevelMutation.mockReturnValue({ mutate: vi.fn() })
  queries.usePriceLines.mockReturnValue({ ...idle, data: [] })
  queries.usePriceLineMutations.mockReturnValue(mutations())
  queries.useTrendLines.mockReturnValue({ ...idle, data: [] })
  queries.useTrendLineMutations.mockReturnValue(mutations())
  queries.useTextAnnotations.mockReturnValue({ ...idle, data: [] })
  queries.useTextAnnotationMutations.mockReturnValue(mutations())
  queries.usePortfolioInsights.mockReturnValue({ ...idle, data: { upcoming_earnings: [] } })
  queries.usePortfolioSummary.mockReturnValue({ ...idle, data: { total_value: '1000', total_pnl_pct: 1 } })
  queries.useCompanyNews.mockReturnValue({ ...idle, data: { available: true, items: [] } })
  queries.useDiscoverShelf.mockReturnValue({
    ...idle,
    data: { title: 'Oversold', subtitle: 'RSI under 30', total: 0, as_of: '2026-10-30', items: [] },
  })
  queries.useOwnershipSummary.mockReturnValue({ ...idle, data: undefined })
  queries.usePerformance.mockReturnValue({ ...idle, data: undefined })
}

const renderBoards = (route) =>
  renderWithProviders(
    <>
      <Link to="/boards/morning">Elsewhere</Link>
      <Routes>
        <Route path="/boards" element={<Boards />} />
        <Route path="/boards/:id" element={<Boards />} />
      </Routes>
    </>,
    { route },
  )
const failStorage = () =>
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })

const tabs = () => within(screen.getByRole('navigation', { name: 'Boards' }))
const panel = (name) => screen.getByRole('region', { name })
const followsLine = (symbol) => (_, element) =>
  element?.tagName === 'SPAN' && element.textContent === `Follows watchlist · ${symbol}`
const stored = () => JSON.parse(localStorage.getItem('saxodash:boards'))

describe('Boards', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    localStorage.clear()
    window.innerWidth = 1440
    stubQueries()
  })

  it('Boards shows Chart first and the saved boards', () => {
    renderBoards('/boards')

    expect(tabs().getAllByRole('link').map((link) => link.textContent)).toEqual(['Chart', 'Morning check', 'Semiconductors'])
    expect(tabs().getByRole('link', { name: 'Chart' })).toHaveAttribute('aria-current', 'page')
    expect(tabs().getByRole('button', { name: /New board/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit board' })).not.toBeInTheDocument()
  })

  it('/boards?symbol=NVDA opens NVDA in the active pane', () => {
    renderBoards('/boards?symbol=NVDA')

    expect(screen.getByRole('region', { name: 'NVDA chart' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'Back to Research' })).toHaveAttribute(
      'href',
      '/research?symbol=NVDA&uic=211&assetType=Stock',
    )
  })

  it('shows a custom board with its panels and one valid heading outline', () => {
    const { container } = renderBoards('/boards/morning')

    for (const name of ['Watchlist', 'Price chart', 'Today heatmap', 'Your earnings', 'News', 'Symbol stats']) {
      expect(panel(name)).toBeInTheDocument()
    }
    expect(within(panel('Price chart')).getByText(followsLine('GOOGL'))).toBeInTheDocument()
    expectValidHeadingOutline(container)
  })

  it('picking a symbol in a board watchlist updates the followed symbol', async () => {
    renderBoards('/boards/morning')

    await userEvent.click(within(panel('Watchlist')).getByRole('button', { name: /^NVDA/ }))

    expect(within(panel('Price chart')).getByText(followsLine('NVDA'))).toBeInTheDocument()
    expect(within(panel('Symbol stats')).getByText(followsLine('NVDA'))).toBeInTheDocument()
    expect(stored().find((b) => b.id === 'morning').sym).toBe('NVDA')
  })

  it('keyboard: Enter on a watchlist row follows it', async () => {
    renderBoards('/boards/morning')

    within(panel('Watchlist')).getByRole('button', { name: /^TSLA/ }).focus()
    await userEvent.keyboard('{Enter}')

    expect(within(panel('News')).getByText(followsLine('TSLA'))).toBeInTheDocument()
  })

  it('shows a fixed symbol instead of the followed one', () => {
    localStorage.setItem(
      'saxodash:boards',
      JSON.stringify([{ id: 'x', name: 'Fixed', sym: 'NVDA', panels: [{ id: 'p1', type: 'symbol', x: 0, y: 0, w: 4, h: 5, cfg: { sym: 'AAPL' } }] }]),
    )
    renderBoards('/boards/x')

    expect(within(panel('Symbol stats')).getByText('Fixed · AAPL')).toBeInTheDocument()
  })

  it('edit, remove a panel, cancel restores it', async () => {
    renderBoards('/boards/morning')

    await userEvent.click(screen.getByRole('button', { name: 'Edit board' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove News' }))
    expect(screen.queryByRole('region', { name: 'News' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(panel('News')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove News' })).not.toBeInTheDocument()
    expect(localStorage.getItem('saxodash:boards')).toBeNull()
  })

  it('edit, add Discover shelf, save persists to saxodash:boards', async () => {
    renderBoards('/boards/morning')

    await userEvent.click(screen.getByRole('button', { name: 'Edit board' }))
    await userEvent.click(screen.getByRole('button', { name: /Add panel/ }))
    await userEvent.click(within(screen.getByRole('region', { name: 'Panel library' })).getByRole('button', { name: 'Add Discover shelf' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(panel('Discover shelf')).toBeInTheDocument()
    expect(stored().find((b) => b.id === 'morning').panels.map((p) => p.type)).toContain('shelf')
  })

  it('blocks switching boards while editing', async () => {
    renderBoards('/boards/morning')

    await userEvent.click(screen.getByRole('button', { name: 'Edit board' }))

    expect(tabs().queryByRole('link')).not.toBeInTheDocument()
    expect(tabs().getByRole('button', { name: /New board/ })).toBeDisabled()
  })

  it('opens a new board in edit mode with the library open and the name focused', async () => {
    renderBoards('/boards')

    await userEvent.click(tabs().getByRole('button', { name: /New board/ }))

    const name = screen.getByRole('textbox', { name: 'Board name' })
    expect(name).toHaveValue('Untitled board')
    expect(name).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Panel library' })).toBeInTheDocument()
    expect(tabs().getByText('Untitled board')).toBeInTheDocument()
  })

  it('removes a never-saved new board on Cancel', async () => {
    renderBoards('/boards')

    await userEvent.click(tabs().getByRole('button', { name: /New board/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(tabs().queryByText('Untitled board')).not.toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'Chart' })).toHaveAttribute('aria-current', 'page')
  })

  it('saves a new board under its typed name with a unique id', async () => {
    renderBoards('/boards')

    await userEvent.click(tabs().getByRole('button', { name: /New board/ }))
    const name = screen.getByRole('textbox', { name: 'Board name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Energy')
    await userEvent.click(screen.getByRole('button', { name: 'Add Net worth' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const boards = stored()
    expect(boards.map((b) => b.name)).toEqual(['Morning check', 'Semiconductors', 'Energy'])
    expect(new Set(boards.map((b) => b.id)).size).toBe(3)
    expect(tabs().getByRole('link', { name: 'Energy' })).toHaveAttribute('aria-current', 'page')
  })

  it('deletes a board only on a second click', async () => {
    renderBoards('/boards/semis')

    await userEvent.click(screen.getByRole('button', { name: 'Edit board' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete board' }))
    expect(tabs().getByText('Semiconductors')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Click again to delete' }))

    expect(tabs().queryByText('Semiconductors')).not.toBeInTheDocument()
    expect(stored().map((b) => b.id)).toEqual(['morning'])
  })

  it('says so when a board id is not saved in this browser', () => {
    renderBoards('/boards/nope')

    expect(screen.getByRole('heading', { name: 'No such board' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to the Chart board/ })).toHaveAttribute('href', '/boards')
  })

  it('keeps editing off below 760 px by hiding Edit board and New board behind a note', () => {
    renderBoards('/boards/morning')

    expect(screen.getByRole('button', { name: 'Edit board' })).toHaveClass('hidden', 'min-[760px]:inline-flex')
    expect(tabs().getByRole('button', { name: /New board/ })).toHaveClass('hidden', 'min-[760px]:inline-flex')
    expect(screen.getByText('Editing needs a wider screen')).toHaveClass('min-[760px]:hidden')
  })

  it('never enters edit mode at a phone width', async () => {
    window.innerWidth = 500
    renderBoards('/boards/morning')

    await userEvent.click(screen.getByRole('button', { name: 'Edit board' }))
    await userEvent.click(tabs().getByRole('button', { name: /New board/ }))

    expect(screen.queryByRole('textbox', { name: 'Board name' })).not.toBeInTheDocument()
    expect(tabs().queryByText('Untitled board')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove News' })).not.toBeInTheDocument()
  })

  it('says when the browser refuses to save, and keeps the edits open', async () => {
    renderBoards('/boards/morning')
    await userEvent.click(screen.getByRole('button', { name: 'Edit board' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove News' }))
    failStorage()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save in this browser')
    expect(screen.getByRole('textbox', { name: 'Board name' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'News' })).not.toBeInTheDocument()
  })

  it('still follows a symbol when the browser refuses to save it', async () => {
    failStorage()
    renderBoards('/boards/morning')

    await userEvent.click(within(panel('Watchlist')).getByRole('button', { name: /^NVDA/ }))

    expect(within(panel('Price chart')).getByText(followsLine('NVDA'))).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save in this browser')
  })

  it('drops a never-saved new board when the page moves away from it', async () => {
    renderBoards('/boards')
    await userEvent.click(tabs().getByRole('button', { name: /New board/ }))

    await userEvent.click(screen.getByRole('link', { name: 'Elsewhere' }))
    expect(tabs().queryByText('Untitled board')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit board' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(stored().map((b) => b.name)).toEqual(['Morning check', 'Semiconductors'])
  })

  it('shows the honest not-connected state in a chart panel when Saxo is down', () => {
    queries.useChart.mockReturnValue({ data: undefined, isLoading: false, error: { status: 409, detail: 'Saxo is not connected.' } })
    renderBoards('/boards/morning')

    expect(within(panel('Symbol stats')).getByText(/There is no price history to chart yet/)).toBeInTheDocument()
  })
})
