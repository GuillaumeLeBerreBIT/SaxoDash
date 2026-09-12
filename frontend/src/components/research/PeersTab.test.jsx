import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PeersTab from './PeersTab'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

beforeEach(() => vi.clearAllMocks())

const CURRENT = {
  available: true,
  price_return_1y: 12.5,
  market_cap: 3_100_000,
  pe_ratio: 32.1,
  peg_ratio: 2.1,
  revenue_growth_ttm_yoy: 8.2,
  eps_growth_ttm_yoy: 14.0,
  net_margin: 25.3,
  roe: 45.1,
  recommendation: { strong_buy: 10, buy: 5, hold: 2, sell: 0, strong_sell: 0 },
}

const PEER = {
  available: true,
  price_return_1y: 5.0,
  market_cap: 2_000_000,
  pe_ratio: 28.0,
  peg_ratio: 1.8,
  revenue_growth_ttm_yoy: 6.0,
  eps_growth_ttm_yoy: 9.0,
  net_margin: 20.0,
  roe: 30.0,
  recommendation: { strong_buy: 2, buy: 8, hold: 3, sell: 0, strong_sell: 0 },
}

function stub({
  peersData = { available: true, symbols: ['MSFT'] },
  peerResults = [{ data: PEER, isLoading: false }],
} = {}) {
  queries.usePeers.mockReturnValue({ data: peersData, isLoading: false })
  queries.usePeerFundamentals.mockReturnValue(peerResults)
  queries.useInstrumentSearch.mockReturnValue({ data: [] })
}

describe('PeersTab', () => {
  it('shows the current symbol and its auto peers as columns', () => {
    stub()
    render(<PeersTab symbol="AAPL" fundamentals={{ data: CURRENT, isLoading: false }} />)
    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('MSFT')).toBeInTheDocument()
    expect(screen.getByText('Strong buy')).toBeInTheDocument()
  })

  it('shows a dash for a peer whose fundamentals are unavailable', () => {
    stub({ peerResults: [{ data: { available: false, reason: 'x' }, isLoading: false }] })
    render(<PeersTab symbol="AAPL" fundamentals={{ data: CURRENT, isLoading: false }} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('removes a peer column when its remove button is clicked', async () => {
    stub()
    render(<PeersTab symbol="AAPL" fundamentals={{ data: CURRENT, isLoading: false }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove MSFT' }))
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument()
  })

  it('shows a reconnect hint instead of silently doing nothing when the search fails', async () => {
    stub()
    queries.useInstrumentSearch.mockReturnValue({ data: undefined, isError: true })
    render(<PeersTab symbol="AAPL" fundamentals={{ data: CURRENT, isLoading: false }} />)
    await userEvent.type(screen.getByLabelText('Add peer'), 'MS')
    expect(screen.getByText(/reconnect saxo/i)).toBeInTheDocument()
  })

  it('falls back to the fundamentals gate when the current symbol has no data', () => {
    stub()
    render(<PeersTab symbol="AAPL" fundamentals={{ data: { available: false, reason: 'nope' }, isLoading: false }} />)
    expect(screen.getByText('nope')).toBeInTheDocument()
  })
})
