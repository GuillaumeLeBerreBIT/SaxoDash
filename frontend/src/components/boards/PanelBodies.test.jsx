import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import { ChartBoardPanel, SymbolStatsPanel, WatchlistPanel } from './PanelBodies'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const idle = { data: undefined, isLoading: false, error: null }
const bars = Array.from({ length: 40 }, (_, i) => ({
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 1_000_000,
}))
const position = { ticker: 'NVDA', uic: 211, asset_type: 'Stock', currency: 'USD', value: '1000', pnl_pct: 2 }
const board = { id: 'b', name: 'B', sym: 'NVDA', panels: [] }
const mutations = () => ({ create: { mutate: vi.fn() }, update: { mutate: vi.fn() }, remove: { mutate: vi.fn() } })

function stub() {
  queries.usePositions.mockReturnValue({ ...idle, data: [position] })
  queries.usePositionQuotes.mockReturnValue(new Map())
  queries.useInstrumentSearch.mockReturnValue({ ...idle, data: [] })
  queries.useChart.mockReturnValue({ data: bars, isLoading: false, error: null })
  queries.useInstrumentDetails.mockReturnValue({ ...idle, data: undefined })
  queries.useQuotes.mockReturnValue({ ...idle, data: [] })
  queries.useQuotesByAssetType.mockReturnValue({ data: [], isLoading: false })
  queries.useSymbolEarnings.mockReturnValue({ ...idle, data: { available: false } })
  queries.useSymbolNote.mockReturnValue({ ...idle, data: null })
  queries.usePriceLines.mockReturnValue({ ...idle, data: [] })
  queries.usePriceLineMutations.mockReturnValue(mutations())
  queries.useTrendLines.mockReturnValue({ ...idle, data: [] })
  queries.useTrendLineMutations.mockReturnValue(mutations())
  queries.useTextAnnotations.mockReturnValue({ ...idle, data: [] })
  queries.useTextAnnotationMutations.mockReturnValue(mutations())
  queries.useWatchlists.mockReturnValue({ ...idle, data: [] })
  queries.useWatchlistMutations.mockReturnValue({ ...mutations(), rename: { mutate: vi.fn() }, addItem: { mutate: vi.fn() }, removeItem: { mutate: vi.fn() } })
}

const panel = (type, cfg) => ({ id: 'p1', type, x: 0, y: 0, w: 4, h: 5, ...(cfg ? { cfg } : {}) })
const dotTone = (container) => container.querySelector('[aria-hidden="true"].rounded-full').className

describe('PanelBodies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stub()
  })

  it('marks the chart panel ok while the chart loads its bars', () => {
    const { container } = renderWithProviders(<ChartBoardPanel board={board} panel={panel('chart')} />)
    expect(dotTone(container)).toContain('bg-ok')
  })

  it('marks the chart panel warn when Saxo is not connected', () => {
    queries.useChart.mockReturnValue({ data: undefined, isLoading: false, error: { status: 409, detail: 'Saxo is not connected.' } })
    const { container } = renderWithProviders(<ChartBoardPanel board={board} panel={panel('chart')} />)

    expect(dotTone(container)).toContain('bg-warn')
    expect(screen.getByText(/There is no price history to chart yet/)).toBeInTheDocument()
  })

  it('takes the range from bar highs and lows, priced in the listing currency', () => {
    renderWithProviders(<SymbolStatsPanel board={board} panel={panel('symbol')} />)

    expect(screen.getByText('Range of the fetched history')).toBeInTheDocument()
    expect(screen.getByText(/^US\$98\.00$/)).toBeInTheDocument()
    expect(screen.getByText(/^US\$143\.00$/)).toBeInTheDocument()
  })

  it('names a range of closes as such when the bars carry no highs and lows', () => {
    queries.useChart.mockReturnValue({ data: bars.map(({ date, close }) => ({ date, close })), isLoading: false, error: null })
    renderWithProviders(<SymbolStatsPanel board={board} panel={panel('symbol')} />)

    expect(screen.getByText('Range of closes, fetched history')).toBeInTheDocument()
    expect(screen.getByText(/^US\$102\.00$/)).toBeInTheDocument()
  })

  it('marks the symbol panel warn when its chart fails', () => {
    queries.useChart.mockReturnValue({ data: undefined, isLoading: false, error: { status: 502 } })
    const { container } = renderWithProviders(<SymbolStatsPanel board={board} panel={panel('symbol')} />)
    expect(dotTone(container)).toContain('bg-warn')
  })

  it('reads the held set for a watchlist without asking for position quotes', () => {
    renderWithProviders(<WatchlistPanel board={board} panel={panel('watchlist')} onFollow={vi.fn()} />)

    expect(queries.usePositions).toHaveBeenCalled()
    expect(queries.usePositionQuotes).not.toHaveBeenCalled()
  })

  it('lists a fixed watchlist and follows a row', () => {
    const onFollow = vi.fn()
    renderWithProviders(<WatchlistPanel board={board} panel={panel('watchlist', { list: ['AMD', 'NVDA'], title: 'Chips' })} onFollow={onFollow} />)

    within(screen.getByRole('list')).getByRole('button', { name: /AMD/ }).click()
    expect(onFollow).toHaveBeenCalledWith('AMD')
  })
})
