import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import CongressDirectory from './CongressDirectory'

const ownership = vi.fn((ticker) => ({
  isFetching: false,
  data: ticker === 'NVDA' ? { members: [{ slug: 'tom-suozzi' }] } : undefined,
}))

vi.mock('../../api/queries', () => ({
  useCongressOwnership: (ticker) => ownership(ticker),
  useCongressMembers: () => ({
    isLoading: false,
    data: {
      window_days: 90,
      most_bought: [{ ticker: 'NVDA', buyers: 4, sellers: 1 }],
      members: [
        { slug: 'nancy-pelosi', name: 'Nancy Pelosi', party: 'Democrat', state_district: 'CA11', photo_url: 'https://example.test/p.jpg', trades: 40, last_filed: '2026-10-02', excess_cagr_pct: 12.3, top_holdings: [{ ticker: 'NVDA', weight_pct: 30 }] },
        { slug: 'dan-crenshaw', name: 'Dan Crenshaw', party: 'Republican', state_district: 'TX02', photo_url: '', trades: 12, last_filed: '2026-09-01', excess_cagr_pct: null, top_holdings: [] },
        { slug: 'ro-khanna', name: 'Ro Khanna', party: 'Democrat', state_district: 'CA17', photo_url: '', trades: 5, last_filed: '2026-08-01', excess_cagr_pct: 20.1, top_holdings: [] },
        { slug: 'tom-suozzi', name: 'Tom Suozzi', party: 'Democrat', state_district: 'NY03', photo_url: '', trades: 3, last_filed: '2026-07-01', excess_cagr_pct: -4.2, top_holdings: [] },
      ],
    },
  }),
}))

const cardNames = () => screen.getAllByTestId('congress-card').map((card) => within(card).getAllByRole('link')[0].textContent)
const search = (text) => fireEvent.change(screen.getByRole('searchbox', { name: 'Search members' }), { target: { value: text } })

describe('CongressDirectory', () => {
  it('shows members as cards ordered by copy edge, linking to their page', () => {
    renderWithProviders(<CongressDirectory />)
    expect(cardNames()).toEqual(['Ro Khanna', 'Nancy Pelosi', 'Tom Suozzi', 'Dan Crenshaw'])
    expect(screen.getByRole('link', { name: 'Nancy Pelosi' })).toHaveAttribute('href', '/investors/congress/nancy-pelosi')
    expect(screen.getByText('D-CA11 · 40 trades')).toBeInTheDocument()
    expect(screen.getByText('+12.3 pts')).toBeInTheDocument()
  })

  it('shows the most bought shelf with its window', () => {
    renderWithProviders(<CongressDirectory />)
    expect(screen.getByRole('heading', { name: 'Most bought by Congress, last 90 days' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^NVDA\s*4 ↑/ })).toHaveAttribute('href', '/research?symbol=NVDA&tab=congress')
  })

  it('links a member\'s top holdings to the Congress tab of Research', () => {
    renderWithProviders(<CongressDirectory />)
    const pelosi = screen.getAllByTestId('congress-card').find((card) => within(card).queryByText('Nancy Pelosi'))
    expect(within(pelosi).getByRole('link', { name: 'NVDA' })).toHaveAttribute('href', '/research?symbol=NVDA&tab=congress')
  })

  it('shows each most bought stock with its logo', () => {
    renderWithProviders(<CongressDirectory />)
    const chip = screen.getByRole('link', { name: /^NVDA\s*4 ↑/ })
    expect(chip.querySelector('img')).toHaveAttribute('src', 'https://api.elbstream.com/logos/symbol/NVDA')
  })

  it('narrows the list as a name is typed', () => {
    renderWithProviders(<CongressDirectory />)
    search('pelo')
    expect(cardNames()).toEqual(['Nancy Pelosi'])
  })

  it('finds members by state', () => {
    renderWithProviders(<CongressDirectory />)
    search('TX')
    expect(cardNames()).toEqual(['Dan Crenshaw'])
  })

  it('finds members who traded a searched ticker', async () => {
    renderWithProviders(<CongressDirectory />)
    search('nvda')
    await waitFor(() => expect(cardNames()).toEqual(['Tom Suozzi']))
    expect(ownership).toHaveBeenCalledWith('NVDA')
  })

  it('says when nothing matches', async () => {
    renderWithProviders(<CongressDirectory />)
    search('zzzz zzzz')
    expect(await screen.findByText('No member matches “zzzz zzzz”.')).toBeInTheDocument()
  })

  it('filters to one party', () => {
    renderWithProviders(<CongressDirectory />)
    fireEvent.click(screen.getByRole('button', { name: 'Republicans' }))
    expect(cardNames()).toEqual(['Dan Crenshaw'])
  })

  it('switches to a table that sorts from its headers', () => {
    renderWithProviders(<CongressDirectory />)
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    const rowNames = () => screen.getAllByRole('row').slice(1).map((row) => row.querySelector('a').textContent)
    expect(rowNames()).toEqual(['Ro Khanna', 'Nancy Pelosi', 'Tom Suozzi', 'Dan Crenshaw'])
    fireEvent.click(screen.getByRole('button', { name: 'Member' }))
    expect(rowNames()).toEqual(['Dan Crenshaw', 'Nancy Pelosi', 'Ro Khanna', 'Tom Suozzi'])
    expect(screen.getByRole('combobox', { name: 'Sort members' })).toHaveValue('name')
  })
})
