import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom'

import App from './App'

vi.mock('./api/client', () => ({ isAuthenticated: () => true }))
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
vi.mock('./pages/Transactions', () => page('Transactions page'))
vi.mock('./pages/Accounts', () => page('Accounts page'))
vi.mock('./pages/AccountTransactions', () => page('AccountTransactions page'))
vi.mock('./pages/Spending', () => page('Spending page'))
vi.mock('./pages/SpendingTransactions', () => page('SpendingTransactions page'))
vi.mock('./pages/Research', () => page('Research page'))
vi.mock('./pages/ResearchChart', () => page('Chart page'))
vi.mock('./pages/Discover', () => page('Discover page'))
vi.mock('./pages/DiscoverShelf', () => page('DiscoverShelf page'))
vi.mock('./pages/Earnings', () => page('Earnings page'))
vi.mock('./pages/Investors', () => page('Investors page'))
vi.mock('./pages/Investor', () => page('Investor page'))
vi.mock('./pages/InvestorStocks', () => page('InvestorStocks page'))
vi.mock('./pages/CongressMember', () => page('CongressMember page'))
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
    ['/research/chart?symbol=NVDA', '/boards?symbol=NVDA', 'Chart page'],
    ['/transactions', '/portfolio?view=transactions', 'Transactions page'],
    ['/transactions?type=BUY&from=2026-01-01', '/portfolio?view=transactions&type=BUY&from=2026-01-01', 'Transactions page'],
    ['/accounts', '/money?section=accounts', 'Accounts page'],
    ['/accounts/12', '/money/accounts/12', 'AccountTransactions page'],
    ['/spending', '/money?section=spending', 'Spending page'],
    ['/spending?period=3m', '/money?section=spending&period=3m', 'Spending page'],
    [
      '/spending/transactions?category=GROCERIES&from=2026-01-01',
      '/money?section=transactions&category=GROCERIES&from=2026-01-01',
      'SpendingTransactions page',
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
    ['/portfolio?view=transactions', 'Transactions page'],
    ['/money', 'Spending page'],
    ['/money?section=budgets', 'Spending page'],
    ['/money?section=overview', 'Spending page'],
    ['/money?section=accounts', 'Accounts page'],
    ['/money?section=transactions', 'SpendingTransactions page'],
    ['/money/accounts/3', 'AccountTransactions page'],
    ['/boards', 'Chart page'],
    ['/boards/b1', 'Chart page'],
  ])('%s renders %s inside the frame', (url, rendered) => {
    renderAt(url)
    expect(screen.getByText(rendered)).toBeInTheDocument()
    expect(screen.getByTestId('frame')).toBeInTheDocument()
  })

  it('renders a Settings placeholder inside the frame', () => {
    renderAt('/settings')
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByTestId('frame')).toBeInTheDocument()
  })
})
