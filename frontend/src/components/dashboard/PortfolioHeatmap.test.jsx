import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../../test/renderWithProviders'
import { LAST_SESSION_NOTE } from '../../lib/pricing'
import PortfolioHeatmap from './PortfolioHeatmap'

const positions = [
  { id: 1, ticker: 'NVDA', name: 'NVIDIA', sector: 'Technology', value: '6000.00', weight: '60.0', pnl: '2500.00', pnl_pct: 71.4, uic: 211, asset_type: 'Stock' },
  { id: 2, ticker: 'MSFT', name: 'Microsoft', sector: 'Technology', value: '3000.00', weight: '30.0', pnl: '-200.00', pnl_pct: -6.3, uic: 212, asset_type: 'Stock' },
  { id: 3, ticker: 'KO', name: 'Coca-Cola', sector: 'Staples', value: '1000.00', weight: '10.0', pnl: '50.00', pnl_pct: 5.3, uic: null, asset_type: null },
]

const live = new Map([
  [211, { uic: 211, change_pct: 2.0, change_basis: 'live' }],
  [212, { uic: 212, change_pct: -1.0, change_basis: 'live' }],
])

const tile = (ticker) => screen.getByRole('link', { name: new RegExp(`^${ticker} `) })

describe('PortfolioHeatmap', () => {
  it('gives every holding a tile linking to its research page', () => {
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={live} />)
    expect(tile('NVDA')).toHaveAttribute('href', '/research?symbol=NVDA&uic=211&assetType=Stock')
    expect(tile('KO')).toHaveAttribute('href', '/research?symbol=KO')
  })

  it("opens on today's move, with a dash for a holding that has no quote", () => {
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={live} />)
    expect(tile('NVDA')).toHaveTextContent('+2.0%')
    expect(tile('MSFT')).toHaveTextContent('-1.0%')
    expect(tile('KO')).toHaveTextContent('—')
  })

  it('names each sector with its share of the book', () => {
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={live} />)
    expect(screen.getByText('Technology · 90%')).toBeInTheDocument()
    expect(screen.getByText('Staples · 10%')).toBeInTheDocument()
  })

  it('sums the day in euros and names the biggest driver', () => {
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={live} />)
    const summary = screen.getByText(/biggest driver/).closest('p')
    expect(summary).toHaveTextContent('+€87')
    expect(summary).toHaveTextContent('NVDA +€118')
  })

  it('discloses partial coverage when not every position has a move', () => {
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={live} />)
    const summary = screen.getByText(/biggest driver/).closest('p')
    expect(summary).toHaveTextContent('2 of 3 priced')
  })

  it('says nothing about coverage when every position is priced', () => {
    const koWithUic = { ...positions[2], uic: 213 }
    const allPriced = new Map([...live, [213, { uic: 213, change_pct: 0.5, change_basis: 'live' }]])
    renderWithProviders(<PortfolioHeatmap positions={[positions[0], positions[1], koWithUic]} quotes={allPriced} />)
    const summary = screen.getByText(/biggest driver/).closest('p')
    expect(summary).not.toHaveTextContent('priced')
  })

  it('colours a day that rounds to zero neutral, not green', () => {
    const flat = [
      { id: 1, ticker: 'FLAT', name: 'Flat', sector: 'Tech', value: '1000.00', weight: '100.0', pnl: '0', pnl_pct: 0, uic: 1, asset_type: 'Stock' },
    ]
    const flatQuotes = new Map([[1, { uic: 1, change_pct: 0, change_basis: 'live' }]])
    renderWithProviders(<PortfolioHeatmap positions={flat} quotes={flatQuotes} />)
    const summary = screen.getByText(/biggest driver/).closest('p')
    const figure = summary.querySelector('span')
    expect(figure).toHaveClass('text-zinc-300')
    expect(figure).not.toHaveClass('text-emerald-400')
  })

  it('switches to the return since purchase', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={live} />)
    await user.click(screen.getByRole('button', { name: 'Since purchase' }))
    expect(tile('NVDA')).toHaveTextContent('+71.4%')
    const summary = screen.getByText(/Biggest contributor/).closest('p')
    expect(summary).toHaveTextContent('NVDA +€2,500')
    expect(summary).toHaveTextContent('MSFT -€200')
  })

  it('discloses a latest-session move instead of calling it today', () => {
    const lastClose = new Map([[211, { uic: 211, change_pct: 2.0, change_basis: 'last_close' }]])
    renderWithProviders(<PortfolioHeatmap positions={positions} quotes={lastClose} />)
    expect(screen.getByRole('button', { name: 'Latest session' })).toBeInTheDocument()
    expect(screen.getByText(LAST_SESSION_NOTE)).toBeInTheDocument()
  })

  it('keeps a tile too small for text reachable by name', () => {
    const lopsided = [
      { id: 1, ticker: 'BIG', name: 'Big', sector: 'Tech', value: '99900', weight: '99.99', pnl: '0', pnl_pct: 0, uic: 1, asset_type: 'Stock' },
      { id: 2, ticker: 'TINY', name: 'Tiny', sector: 'Tech', value: '10', weight: '0.01', pnl: '0', pnl_pct: 0, uic: 2, asset_type: 'Stock' },
    ]
    renderWithProviders(<PortfolioHeatmap positions={lopsided} quotes={new Map()} />)
    expect(tile('TINY')).toBeInTheDocument()
    expect(screen.queryByText('TINY')).not.toBeInTheDocument()
  })

  it('shows an empty state without holdings', () => {
    renderWithProviders(<PortfolioHeatmap positions={[]} quotes={new Map()} />)
    expect(screen.getByText('No holdings yet.')).toBeInTheDocument()
  })
})
