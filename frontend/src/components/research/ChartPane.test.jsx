import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import { DEFAULT_CHART_PREFS } from '../../lib/chartPrefs'
import { DEFAULT_PANE_HEIGHTS } from '../../lib/chartOptions'
import { LATEST_TIME_VIEW } from '../../lib/timeWindow'
import ChartPane from './ChartPane'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const bars = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 1_000_000,
}))
const idle = { data: undefined, isLoading: false, error: null }
const nvda = { symbol: 'NVDA', uic: 211, assetType: 'Stock' }
const controls = { ...DEFAULT_CHART_PREFS, setRange: vi.fn(), setType: vi.fn(), toggleOverlay: vi.fn(), togglePane: vi.fn() }
const view = {
  yScale: 1,
  yShift: 0,
  timeView: LATEST_TIME_VIEW,
  setYScale: vi.fn(),
  setYShift: vi.fn(),
  setTimeView: vi.fn(),
  resetView: vi.fn(),
}

function stub() {
  queries.useChart.mockImplementation(({ uic } = {}) => (uic ? { data: bars, isLoading: false, error: null } : { ...idle }))
  queries.useInstrumentDetails.mockReturnValue({ ...idle, data: { currency: 'USD' } })
  queries.useSymbolEarnings.mockReturnValue({ ...idle, data: { available: false } })
  queries.useSymbolNote.mockReturnValue({ ...idle, data: null })
  queries.useNoteLevelMutation.mockReturnValue({ mutate: vi.fn() })
  queries.usePriceLines.mockReturnValue({ ...idle, data: [] })
  queries.usePriceLineMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    update: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  })
  queries.useQuotes.mockReturnValue({
    ...idle,
    data: [{ uic: 211, price: 875.4, change_pct: 1.42, change_basis: 'last_close' }],
  })
}

const renderPane = (props = {}) =>
  renderWithProviders(
    <ChartPane
      slot={nvda}
      active={false}
      outlined={false}
      controls={controls}
      view={view}
      onActivate={vi.fn()}
      tool="crosshair"
      onPlaced={vi.fn()}
      paneHeights={DEFAULT_PANE_HEIGHTS}
      {...props}
    />,
  )

describe('ChartPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stub()
  })

  it('asks for a symbol when empty', () => {
    renderPane({ slot: null })
    const pane = screen.getByRole('region', { name: 'Empty chart' })
    expect(within(pane).getByText('Pick a symbol from the watchlist')).toBeInTheDocument()
    expect(screen.queryByTestId('price-scale')).not.toBeInTheDocument()
  })

  it('heads a filled pane with its ticker, price and labelled move', () => {
    renderPane()
    const pane = screen.getByRole('region', { name: 'NVDA chart' })
    expect(within(pane).getByText('NVDA')).toBeInTheDocument()
    expect(within(pane).getByText('875.40')).toBeInTheDocument()
    expect(within(pane).getByText('+1.42% latest session')).toBeInTheDocument()
    expect(within(pane).getByTestId('price-scale')).toBeInTheDocument()
  })

  it('drops the ticker, price and move in a single-pane layout, leaving the period change', () => {
    renderPane({ split: false })
    const pane = screen.getByRole('region', { name: 'NVDA chart' })
    expect(within(pane).queryByText('NVDA')).not.toBeInTheDocument()
    expect(within(pane).queryByText('875.40')).not.toBeInTheDocument()
    expect(within(pane).queryByText('+1.42% latest session')).not.toBeInTheDocument()
    expect(within(pane).getByText(/^Period/)).toBeInTheDocument()
  })

  it('shows the unresolved state for a stored pane with no uic', () => {
    renderPane({ slot: { symbol: 'XYZ', uic: null, assetType: null } })
    expect(screen.getByRole('region', { name: 'XYZ chart' })).toBeInTheDocument()
    expect(screen.queryByTestId('price-scale')).not.toBeInTheDocument()
    expect(queries.useChart).toHaveBeenLastCalledWith(expect.objectContaining({ uic: undefined }))
  })

  it('activates on press', () => {
    const onActivate = vi.fn()
    renderPane({ onActivate })
    fireEvent.mouseDown(screen.getByRole('region', { name: 'NVDA chart' }))
    expect(onActivate).toHaveBeenCalled()
  })

  it('marks the active pane', () => {
    renderPane({ active: true })
    expect(screen.getByRole('region', { name: 'NVDA chart' })).toHaveAttribute('aria-current', 'true')
  })
})
