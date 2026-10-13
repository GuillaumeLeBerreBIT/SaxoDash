import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import { fmtMonthYear } from '../../lib/format'
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
    expect(screen.getByText(`55 analysts · as of ${fmtMonthYear('2026-09-01')}`)).toBeInTheDocument()
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

  it('leaves the date out of the analyst caption when the recommendation has none', () => {
    queries.useFundamentals.mockReturnValue({
      data: { ...fundamentals, recommendation: { ...fundamentals.recommendation, period: undefined } },
      isLoading: false,
    })
    renderWithProviders(panel())

    expect(screen.getByText('55 analysts')).toBeInTheDocument()
  })

  it('does not ask for fundamentals or hold a place when the instrument is unresolved', () => {
    queries.useFundamentals.mockReturnValue({ data: undefined, isLoading: true })
    renderWithProviders(panel({ instrument: null }))

    expect(queries.useFundamentals).toHaveBeenCalledWith('')
    expect(queries.useFundamentals).not.toHaveBeenCalledWith('NOW')
    expect(screen.queryByTestId('symbol-panel-loading')).not.toBeInTheDocument()
  })

  it('leaves the next earnings row out when its date has passed', () => {
    const stale = { data: { ...earnings.data, next: { date: '2020-01-01', session: 'amc', eps_estimate: 1.02 } } }
    renderWithProviders(panel({ earnings: stale }))

    expect(screen.queryByText('Next earnings')).not.toBeInTheDocument()
    expect(screen.queryByText(/Past/)).not.toBeInTheDocument()
  })

  it('prints the day and the session of the next earnings in separate elements', () => {
    const { container } = renderWithProviders(panel())

    const value = container.querySelector('[data-stat="next-earnings"]')
    const lines = [...value.children].map((node) => node.textContent)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^In \d+ days$/)
    expect(lines[1]).toBe('After close')
  })

  it('puts each count term before its value', () => {
    renderWithProviders(panel())

    const group = screen.getByText('Strong buy').closest('div')
    expect(group.firstElementChild.tagName).toBe('DT')
    const technicals = screen.getByText('Neutral').closest('div')
    expect(technicals.firstElementChild.tagName).toBe('DT')
  })

  it('averages volume over the bars that carry it', () => {
    const bars = dailyBars(700).map((bar, i, all) => ({ ...bar, volume: (all.length - 1 - i) % 2 === 0 ? 2_000_000 : 0 }))
    renderWithProviders(panel({ bars }))

    expect(screen.getByText('2.00M', { selector: '[data-stat="average-volume"]' })).toBeInTheDocument()
  })

  it('names the earnings section briefly', () => {
    renderWithProviders(panel())
    expect(screen.getByText('EPS vs estimate')).toBeInTheDocument()
  })

  it('holds a place for the analyst block while fundamentals load', () => {
    queries.useFundamentals.mockReturnValue({ data: undefined, isLoading: true })
    renderWithProviders(panel())

    expect(screen.getByTestId('symbol-panel-loading')).toBeInTheDocument()
  })
})
