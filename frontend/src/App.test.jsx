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
vi.mock('./components/money/AccountsSection', () => page('Accounts section'))
vi.mock('./pages/AccountTransactions', () => page('AccountTransactions page'))
vi.mock('./components/money/SpendingSection', () => page('Spending section'))
vi.mock('./components/money/TransactionsSection', () => page('Transactions section'))
vi.mock('./components/money/BudgetsSection', () => page('Budgets section'))
vi.mock('./components/money/OverviewSection', () => page('Overview section'))
vi.mock('./pages/Research', () => page('Research page'))
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
  return screen.getByTestId('where').textContent
}

describe('legacy routes redirect with their query', () => {
  it.each([
    ['/research/chart?symbol=NVDA', '/boards?symbol=NVDA', 'Boards page'],
    ['/transactions', '/portfolio?view=transactions', 'Portfolio page'],
    ['/transactions?type=BUY&from=2026-01-01', '/portfolio?view=transactions&type=BUY&from=2026-01-01', 'Portfolio page'],
    ['/accounts', '/money?section=accounts', 'Accounts section'],
    ['/accounts/12', '/money/accounts/12', 'AccountTransactions page'],
    ['/spending', '/money?section=spending', 'Spending section'],
    ['/spending?period=3m', '/money?section=spending&period=3m', 'Spending section'],
    [
      '/spending/transactions?category=GROCERIES&from=2026-01-01',
      '/money?section=transactions&category=GROCERIES&from=2026-01-01',
      'Transactions section',
    ],
  ])('%s → %s', (from, to, rendered) => {
    expect(renderAt(from)).toBe(to)
    expect(screen.getByText(rendered)).toBeInTheDocument()
    expect(screen.getByTestId('frame')).toBeInTheDocument()
  })
})

describe('new routes', () => {
  it.each([
    ['/portfolio', 'Portfolio page'],
    ['/portfolio?view=transactions', 'Portfolio page'],
    ['/money', 'Overview section'],
    ['/money?section=budgets', 'Budgets section'],
    ['/money?section=overview', 'Overview section'],
    ['/money?section=accounts', 'Accounts section'],
    ['/money?section=transactions', 'Transactions section'],
    ['/money/accounts/3', 'AccountTransactions page'],
    ['/boards', 'Boards page'],
    ['/boards/b1', 'Boards page'],
  ])('%s renders %s inside the frame', (url, rendered) => {
    renderAt(url)
    expect(screen.getByText(rendered)).toBeInTheDocument()
    expect(screen.getByTestId('frame')).toBeInTheDocument()
  })

  it('renders the Settings page inside the frame', () => {
    renderAt('/settings')
    expect(screen.getByText('Settings page')).toBeInTheDocument()
    expect(screen.getByTestId('frame')).toBeInTheDocument()
  })
})
