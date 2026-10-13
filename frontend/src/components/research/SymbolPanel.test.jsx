import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import SymbolPanel from './SymbolPanel'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const iso = (date) => date.toISOString().slice(0, 10)

function dailyBars(count, { volume = 2_000_000 } = {}) {
  const end = Date.UTC(2026, 9, 9)
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + i * 0.1
    return { date: iso(new Date(end - (count - 1 - i) * 86_400_000)), open: close, high: close, low: close, close, volume }
  })
}

const fundamentals = {
  available: true,
  market_cap: 145_090,
  recommendation: { period: '2026-09-01', strong_buy: 16, buy: 34, hold: 3, sell: 2, strong_sell: 0 },
}

const earnings = {
  data: {
    available: true,
    history: [{ date: '2026-06-30', eps_actual: 0.99, eps_estimate: 0.96, eps_surprise_pct: 3.1 }],
    next: { date: '2099-01-01', session: 'amc', eps_estimate: 1.02 },
    score: null,
  },
}

const stock = { uic: 1, assetType: 'Stock' }
const panel = (props) => (
  <SymbolPanel symbol="NOW" instrument={stock} bars={dailyBars(700)} earnings={earnings} href="/research?symbol=NOW" {...props} />
)

beforeEach(() => {
  vi.resetAllMocks()
  queries.useFundamentals.mockReturnValue({ data: fundamentals, isLoading: false })
})

describe('SymbolPanel', () => {
  it('shows every block for a stock with full data', () => {
    renderWithProviders(panel())

    expect(screen.getByRole('heading', { name: 'NOW' })).toBeInTheDocument()
    expect(screen.getByText('145.09B')).toBeInTheDocument()
    expect(screen.getByText('2.00M', { selector: '[data-stat="volume"]' })).toBeInTheDocument()
    expect(screen.getByText(/After close/)).toBeInTheDocument()
    for (const name of ['Performance', 'Earnings', 'Analyst rating', 'Technicals', 'Seasonals']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getByText('55 analysts · as of 2026-09-01')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open in research/i })).toHaveAttribute('href', '/research?symbol=NOW')
  })

  it('leaves company blocks out for an ETF and does not ask for fundamentals', () => {
    renderWithProviders(panel({ instrument: { uic: 2, assetType: 'Etf' } }))

    expect(queries.useFundamentals).toHaveBeenCalledWith('')
    expect(screen.getByRole('heading', { name: 'Performance' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Technicals' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Earnings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Analyst rating' })).not.toBeInTheDocument()
    expect(screen.queryByText(/After close/)).not.toBeInTheDocument()
  })

  it('still shows the price blocks when fundamentals are unavailable', () => {
    queries.useFundamentals.mockReturnValue({ data: { available: false, reason: 'x' }, isLoading: false })
    renderWithProviders(panel())

    expect(screen.getByRole('heading', { name: 'Performance' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Analyst rating' })).not.toBeInTheDocument()
    expect(screen.queryByText('Market cap')).not.toBeInTheDocument()
  })

  it('leaves volume rows out when the bars carry no volume', () => {
    renderWithProviders(panel({ bars: dailyBars(700, { volume: 0 }) }))

    expect(screen.queryByText('Volume')).not.toBeInTheDocument()
    expect(screen.queryByText('Average volume (30D)')).not.toBeInTheDocument()
  })

  it('renders nothing when there is nothing to show', () => {
    queries.useFundamentals.mockReturnValue({ data: { available: false }, isLoading: false })
    const { container } = renderWithProviders(
      panel({ bars: [], earnings: { data: { available: false } } }),
    )

    expect(container.firstChild).toBeNull()
  })

  it('holds a place for the analyst block while fundamentals load', () => {
    queries.useFundamentals.mockReturnValue({ data: undefined, isLoading: true })
    renderWithProviders(panel())

    expect(screen.getByTestId('symbol-panel-loading')).toBeInTheDocument()
  })
})
