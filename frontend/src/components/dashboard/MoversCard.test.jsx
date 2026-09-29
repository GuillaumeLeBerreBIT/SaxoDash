import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/renderWithProviders'
import MoversCard from './MoversCard'

const movers = {
  best: [{ ticker: 'NVDA', name: 'NVIDIA', pnl_pct: 112.3, pnl: '6949.50', value: '13131.00' }],
  worst: [{ ticker: 'INTC', name: 'Intel', pnl_pct: -22.1, pnl: '-540.00', value: '1900.00' }],
}

describe('MoversCard', () => {
  it('splits gainers and losers and links the tickers', () => {
    renderWithProviders(<MoversCard movers={movers} />)
    expect(screen.getByRole('link', { name: /NVDA/ })).toHaveAttribute('href', '/research?symbol=NVDA')
    expect(screen.getByText(/\+112\.3%/)).toBeInTheDocument()
    expect(screen.getByText(/-22\.1%/)).toBeInTheDocument()
  })

  it('shows an empty state with no holdings', () => {
    renderWithProviders(<MoversCard movers={{ best: [], worst: [] }} />)
    expect(screen.getByText(/No holdings/)).toBeInTheDocument()
  })

  const positions = [
    { ticker: 'NVDA', value: '1020.00', uic: 211, asset_type: 'Stock' },
    { ticker: 'INTC', value: '990.00', uic: 212, asset_type: 'Stock' },
    { ticker: 'KO', value: '500.00', uic: 213, asset_type: 'Stock' },
  ]
  const live = new Map([
    [211, { uic: 211, change_pct: 2, change_basis: 'live' }],
    [212, { uic: 212, change_pct: -1, change_basis: 'live' }],
  ])

  it('opens on the unrealized return since purchase', () => {
    renderWithProviders(<MoversCard movers={movers} positions={positions} quotes={live} />)
    expect(screen.getByText('Unrealized return vs. average cost')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Since purchase' })).toHaveAttribute('aria-pressed', 'true')
  })

  it("ranks today's moves when switched, skipping holdings without a quote", async () => {
    const user = userEvent.setup()
    renderWithProviders(<MoversCard movers={movers} positions={positions} quotes={live} />)
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByText('+2.0%')).toBeInTheDocument()
    expect(screen.getByText('-1.0%')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'KO' })).not.toBeInTheDocument()
  })

  it("links a Today row to the instrument Saxo resolved, not just the ticker", async () => {
    const user = userEvent.setup()
    renderWithProviders(<MoversCard movers={movers} positions={positions} quotes={live} />)
    await user.click(screen.getByRole('button', { name: 'Today' }))
    const href = screen.getByRole('link', { name: 'NVDA' }).getAttribute('href')
    expect(href).toContain('uic=211')
    expect(href).toContain('assetType=Stock')
  })

  it('calls a last-close move the latest session', async () => {
    const user = userEvent.setup()
    const lastClose = new Map([[211, { uic: 211, change_pct: 2, change_basis: 'last_close' }]])
    renderWithProviders(<MoversCard movers={movers} positions={positions} quotes={lastClose} />)
    await user.click(screen.getByRole('button', { name: 'Latest session' }))
    expect(screen.getByText('Latest session, from daily bars')).toBeInTheDocument()
  })

  it('says so when no holding has a move today', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MoversCard movers={movers} positions={positions} quotes={new Map()} />)
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByText('No price moves available yet.')).toBeInTheDocument()
  })
})
