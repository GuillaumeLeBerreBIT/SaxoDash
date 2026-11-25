import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom'

import App from './App'

vi.mock('./api/client', () => ({ isAuthenticated: () => true }))
vi.mock('./api/queries', async (importOriginal) => ({
  ...(await importOriginal()),
  useMe: () => ({ data: { username: 'demo', email: 'd@example.com', is_owner: true }, isLoading: false }),
}))
vi.mock('./components/Layout', () => ({
  default: () => (
    <div data-testid="frame">
      <Outlet />
    </div>
  ),
}))

const { page } = vi.hoisted(() => ({ page: (name) => ({ default: () => name }) }))
vi.mock('./pages/Dashboard', () => page('Dashboard page'))
vi.mock('./pages/Portfolio', () => page('Portfolio page'))
vi.mock('./pages/Analytics', () => page('Analytics page'))
vi.mock('./pages/Research', () => page('Research page'))
vi.mock('./pages/Charts', () => page('Charts page'))
vi.mock('./pages/Boards', () => page('Boards page'))
vi.mock('./pages/Discover', () => page('Discover page'))
vi.mock('./pages/DiscoverShelf', () => page('DiscoverShelf page'))
vi.mock('./pages/Earnings', () => page('Earnings page'))
vi.mock('./pages/Investors', () => page('Investors page'))
vi.mock('./pages/Investor', () => page('Investor page'))
vi.mock('./pages/InvestorStocks', () => page('InvestorStocks page'))
vi.mock('./pages/CongressMember', () => page('CongressMember page'))
vi.mock('./pages/Settings', () => page('Settings page'))
vi.mock('./pages/Login', () => page('Login page'))
vi.mock('./pages/NotFound', () => page('NotFound page'))

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function renderAt(url) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <App />
      <Where />
    </MemoryRouter>,
  )
}

describe('legacy routes redirect with their query', () => {
  it.each([
    ['/research/chart?symbol=NVDA', '/charts?symbol=NVDA', 'Charts page'],
    ['/transactions', '/portfolio?view=transactions', 'Portfolio page'],
    ['/transactions?type=BUY&from=2026-01-01', '/portfolio?view=transactions&type=BUY&from=2026-01-01', 'Portfolio page'],
  ])('%s → %s', async (from, to, rendered) => {
    renderAt(from)
    expect(await screen.findByText(rendered)).toBeInTheDocument()
    expect(screen.getByTestId('where').textContent).toBe(to)
    expect(screen.getByTestId('frame')).toBeInTheDocument()
  })
})

describe('retired Money addresses land on Overview', () => {
  it.each([
    '/money',
    '/money?section=budgets',
    '/money/accounts/3',
    '/accounts',
    '/accounts/12',
    '/spending?period=3m',
    '/spending/transactions?category=GROCERIES',
  ])('%s', async (from) => {
    renderAt(from)
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument()
    expect(screen.getByTestId('where').textContent).toBe('/')
  })
})

describe('new routes', () => {
  it.each([
    ['/portfolio', 'Portfolio page'],
    ['/portfolio?view=transactions', 'Portfolio page'],
    ['/charts', 'Charts page'],
    ['/boards', 'Boards page'],
    ['/boards/b1', 'Boards page'],
  ])('%s renders %s inside the frame', async (url, rendered) => {
    renderAt(url)
    expect(await screen.findByText(rendered)).toBeInTheDocument()
    expect(screen.getByTestId('frame')).toBeInTheDocument()
  })

  it('renders an unknown address as the not-found page inside the frame', async () => {
    renderAt('/no-such-page')
    expect(await screen.findByText('NotFound page')).toBeInTheDocument()
    expect(screen.getByTestId('frame')).toBeInTheDocument()
  })

  it('renders the Settings page inside the frame', async () => {
    renderAt('/settings')
    expect(await screen.findByText('Settings page')).toBeInTheDocument()
    expect(screen.getByTestId('frame')).toBeInTheDocument()
  })
})

describe('pages load on demand', () => {
  it('says the page is loading until its code arrives, then shows it', async () => {
    renderAt('/earnings')
    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument()
    expect(await screen.findByText('Earnings page')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading page' })).not.toBeInTheDocument()
  })
})
