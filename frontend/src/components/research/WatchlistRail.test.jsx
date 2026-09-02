import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../../test/renderWithProviders'
import WatchlistRail from './WatchlistRail'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const idle = { data: undefined, isLoading: false, error: null }

const list = {
  id: 1,
  name: 'Tech',
  items: [
    { id: 7, symbol: 'NVDA', uic: 211, asset_type: 'Stock', exchange: 'NASDAQ' },
    { id: 8, symbol: 'IWDA', uic: 500, asset_type: 'Etf', exchange: 'AMS' },
  ],
}

let mutations

function stub({ watchlists = [list], results = [] } = {}) {
  mutations = {
    create: { mutate: vi.fn() },
    rename: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
    addItem: { mutate: vi.fn() },
    removeItem: { mutate: vi.fn() },
  }
  queries.useWatchlists.mockReturnValue({ ...idle, data: watchlists })
  queries.useWatchlistMutations.mockReturnValue(mutations)
  queries.useInstrumentSearch.mockReturnValue({ ...idle, data: results })
  queries.useQuotes.mockReturnValue({ ...idle, data: [{ uic: 211, price: 875.4, change_pct: 1.42 }] })
}

const render = (props = {}) =>
  renderWithProviders(
    <WatchlistRail symbol="NVDA" onSelectSymbol={vi.fn()} heldSymbols={new Set(['NVDA'])} {...props} />,
  )

describe('WatchlistRail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stub()
  })

  it('lists the active watchlist rows with their quotes', () => {
    render()

    expect(screen.getByText('NVDA')).toBeInTheDocument()
    expect(screen.getByText('875.40')).toBeInTheDocument()
    expect(screen.getByText('+1.42%')).toBeInTheDocument()
  })

  it('shows a dash for a row whose quote has not arrived', () => {
    render()

    // IWDA is an Etf, priced by the second batch, which returned nothing here.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('prices stocks and ETFs in separate batched calls', () => {
    render()

    expect(queries.useQuotes).toHaveBeenCalledWith([211], 'Stock')
    expect(queries.useQuotes).toHaveBeenCalledWith([500], 'Etf')
  })

  it('creates a list from the name typed into the rail', async () => {
    render()

    await userEvent.click(screen.getByRole('button', { name: /Tech/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: '+ New list' }))
    await userEvent.type(screen.getByLabelText('New list name'), 'Semis')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(mutations.create.mutate).toHaveBeenCalledWith('Semis', expect.anything())
  })

  it('adds a searched instrument with the identity Saxo resolved', async () => {
    stub({
      results: [
        { symbol: 'AAPL', uic: 1, asset_type: 'Stock', description: 'Apple Inc', exchange: 'NASDAQ' },
      ],
    })
    render()

    await userEvent.click(screen.getByRole('button', { name: 'Add AAPL' }))

    expect(mutations.addItem.mutate).toHaveBeenCalledWith({
      id: 1,
      item: {
        symbol: 'AAPL',
        uic: 1,
        asset_type: 'Stock',
        description: 'Apple Inc',
        exchange: 'NASDAQ',
      },
    })
  })

  it('will not add a symbol the active list already holds', () => {
    stub({
      results: [
        { symbol: 'NVDA', uic: 211, asset_type: 'Stock', description: 'NVIDIA', exchange: 'NASDAQ' },
      ],
    })
    render()

    expect(screen.getByRole('button', { name: 'NVDA already in list' })).toBeDisabled()
  })

  it('removes a row without selecting it', async () => {
    const onSelectSymbol = vi.fn()
    render({ onSelectSymbol })

    await userEvent.click(screen.getByRole('button', { name: 'Remove NVDA' }))

    expect(mutations.removeItem.mutate).toHaveBeenCalledWith({ id: 1, itemId: 7 })
    expect(onSelectSymbol).not.toHaveBeenCalled()
  })

  it('opens a row when it is clicked', async () => {
    const onSelectSymbol = vi.fn()
    render({ onSelectSymbol })

    await userEvent.click(screen.getByText('IWDA'))

    expect(onSelectSymbol).toHaveBeenCalledWith('IWDA')
  })

  it('invites the user to create a list when there are none', () => {
    stub({ watchlists: [] })
    render()

    expect(screen.getByText(/No lists yet/)).toBeInTheDocument()
  })
})
