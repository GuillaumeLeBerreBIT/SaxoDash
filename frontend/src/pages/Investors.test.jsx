import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import Investors from './Investors'

const card = (over) => ({
  slug: 's', name: 'N', firm: 'F', curated: true, stale: false, import: null, styles: ['Value'], followed: false,
  latest_quarter: '2026-06-30', last_filing_at: '2026-08-14', total_value: 1e9, positions: 10, top10_weight: 90,
  new_count: 1, exited_count: 0, top_holdings: [{ cusip: 'C', ticker: 'AAPL', issuer: 'APPLE', weight: 20 }], ...over,
})
const buffett = card({ slug: 'berkshire-hathaway', name: 'Warren Buffett', firm: 'Berkshire Hathaway', total_value: 299e9, followed: true })
const ackman = card({ slug: 'pershing-square', name: 'Bill Ackman', firm: 'Pershing Square', styles: ['Activist', 'Concentrated'], total_value: 14e9 })
const burry = card({ slug: 'scion', name: 'Michael Burry', firm: 'Scion', styles: ['Contrarian'], stale: true, total_value: 2e8 })
const cards = [buffett, ackman, burry]

const hub = {
  quarter: '2026-06-30', filed: 3, tracked: 3, newest_quarter: '2026-06-30', newest_filed: 3,
  shelves: [
    { key: 'following', title: 'Following', kind: 'investors', total: 1, items: [buffett] },
    {
      key: 'convergent-buys', title: 'Convergent buys', kind: 'stocks', total: 14,
      items: [{ cusip: 'N', ticker: 'NVDA', issuer: 'NVIDIA CORP', sector: 'Technology', owners: 9, bought: 7, sold: 1, new: 2, value: 5e9, investors: [{ slug: 'pershing-square', name: 'Bill Ackman' }] }],
    },
  ],
}

let hubState
let listState
let holders
const follow = vi.fn()
vi.mock('../api/queries', () => ({
  useInvestorHub: () => hubState,
  useInvestors: ({ holds } = {}) => (holds ? { data: holders, isFetching: false } : listState),
  useFollowInvestor: () => ({ mutate: follow }),
  usePrefetchInvestor: () => () => {},
}))
vi.mock('../components/investors/AddInvestorDialog', () => ({ default: ({ onClose }) => <div role="dialog"><button onClick={onClose}>close</button></div> }))

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

const renderPage = (route = '/investors') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/investors" element={<><Investors /><Where /></>} /></Routes>
    </MemoryRouter>,
  )

const directory = () => screen.getByRole('region', { name: 'All investors' })
const directoryNames = () => within(directory()).getAllByTestId('investor-card').map((el) => within(el).getByRole('link').textContent)

describe('Investors hub', () => {
  beforeEach(() => {
    hubState = { data: hub, isLoading: false, error: null }
    listState = { data: cards, isLoading: false, error: null }
    holders = []
    follow.mockReset()
  })

  it('says which quarter the signals describe', () => {
    renderPage()
    expect(screen.getByText('3 tracked · signals for Q2 2026 · 3 of 3 filed')).toBeInTheDocument()
  })

  it('shows each shelf the server sent, with a see-all link to its target', () => {
    renderPage()
    const buys = screen.getByRole('region', { name: 'Convergent buys' })
    expect(within(buys).getByText('NVDA')).toBeInTheDocument()
    expect(within(buys).getByText('7 funds bought · 2 new')).toBeInTheDocument()
    expect(within(buys).getByRole('link', { name: 'See all 14' })).toHaveAttribute('href', '/investors/stocks?view=bought')
    expect(within(screen.getByRole('region', { name: 'Following' })).getByRole('link', { name: 'Warren Buffett' })).toHaveAttribute('href', '/investors/berkshire-hathaway')
  })

  it('shows one line instead of a column of empty shelves', () => {
    hubState = { data: { ...hub, shelves: [] }, isLoading: false, error: null }
    renderPage()
    expect(screen.getByText(/No cross-fund signals yet/)).toBeInTheDocument()
    expect(directoryNames()).toHaveLength(3)
  })

  it('keeps the directory usable when the signals fail to load', () => {
    hubState = { data: undefined, isLoading: false, error: new Error('boom') }
    renderPage()
    expect(screen.getByText(/Could not load this quarter's signals/)).toBeInTheDocument()
    expect(directoryNames()).toHaveLength(3)
  })

  it('lists every investor largest first, each linking to its profile', () => {
    renderPage()
    expect(directoryNames()).toEqual(['Warren Buffett', 'Bill Ackman', 'Michael Burry'])
  })

  it('filters by a style chip and keeps the choice in the URL', () => {
    renderPage()
    fireEvent.click(within(directory()).getByRole('button', { name: 'Activist' }))
    expect(directoryNames()).toEqual(['Bill Ackman'])
    expect(screen.getByTestId('where').textContent).toBe('/investors?chip=Activist')
  })

  it('opens on the chip named in the URL', () => {
    renderPage('/investors?chip=following')
    expect(directoryNames()).toEqual(['Warren Buffett'])
    expect(within(directory()).getByRole('button', { name: 'Following' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the style tags and the quarter moves on a card', () => {
    renderPage()
    const ackmanCard = within(directory()).getAllByTestId('investor-card')[1]
    expect(within(ackmanCard).getByText('Activist')).toBeInTheDocument()
    expect(within(ackmanCard).getByText('+1 new · 0 exited')).toBeInTheDocument()
  })

  it('keeps each count on one line with its label so a narrow card breaks at the separator', () => {
    renderPage()
    const ackmanCard = within(directory()).getAllByTestId('investor-card')[1]
    expect(within(ackmanCard).getByText('+1 new · 0 exited').textContent).toBe('+1\u00a0new · 0\u00a0exited')
  })

  it('follows from the card without navigating', () => {
    renderPage()
    fireEvent.click(within(directory()).getByRole('button', { name: 'Follow Bill Ackman' }))
    expect(follow).toHaveBeenCalledWith({ slug: 'pershing-square', followed: true })
    expect(screen.getByTestId('where').textContent).toBe('/investors')
  })

  it('offers to unfollow an investor already followed', () => {
    renderPage()
    expect(within(directory()).getByRole('button', { name: 'Unfollow Warren Buffett' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says so when a search matches nobody', () => {
    renderPage()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search investors' }), { target: { value: 'zzzzzzzz' } })
    expect(screen.getByText('No tracked investor matches “zzzzzzzz”.')).toBeInTheDocument()
  })

  it('switches the directory to a table', () => {
    renderPage()
    fireEvent.click(within(directory()).getByRole('button', { name: 'Table' }))
    expect(within(directory()).getByRole('table')).toBeInTheDocument()
    expect(within(directory()).getByRole('link', { name: /Bill Ackman/ })).toHaveAttribute('href', '/investors/pershing-square')
  })

  it('opens and closes the add-investor dialog', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add investor' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByText('close'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
