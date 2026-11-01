import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'

import TopBar from './TopBar'
import { renderWithProviders } from '../test/renderWithProviders'
import { NAV_ITEMS } from '../lib/navigation'
import { fmtEur } from '../lib/format'

vi.mock('../api/queries')
import * as queries from '../api/queries'

vi.mock('../api/client', () => ({
  getUsername: () => 'guillaume',
  logout: vi.fn(() => Promise.resolve()),
  connectSaxo: vi.fn(),
}))
import { connectSaxo, logout } from '../api/client'

beforeEach(() => {
  vi.clearAllMocks()
  queries.useSaxoStatus.mockReturnValue({ data: { connected: true, usable: true, last_sync_outcome: 'ok' } })
  queries.usePortfolioSummary.mockReturnValue({ data: { total_value: '40000.00' } })
  queries.useNetWorth.mockReturnValue({ data: { broker_cash: '2634.84', bank_total: '821.54' } })
  queries.useFilingAlerts.mockReturnValue({ data: { unread: 0, alerts: [] } })
  queries.useMarkAlertsRead.mockReturnValue({ mutate: vi.fn() })
})

function renderBar({ route = '/', onOpenPalette = () => {} } = {}) {
  return renderWithProviders(
    <>
      <TopBar onOpenPalette={onOpenPalette} />
      <Routes>
        <Route path="*" element={null} />
        <Route path="login" element={<p>Login page</p>} />
        <Route path="settings" element={<p>Settings page</p>} />
      </Routes>
    </>,
    { route },
  )
}

async function openAccountMenu() {
  await userEvent.click(screen.getByRole('button', { name: /^Account/ }))
  return screen.getByRole('menu')
}

describe('TopBar', () => {
  it('marks the active tab', () => {
    renderBar({ route: '/discover' })
    expect(screen.getByRole('link', { name: 'Discover' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })

  it('links every tab and keeps Settings out of the tabs', () => {
    renderBar()
    const tabs = screen.getByRole('navigation', { name: 'Pages' })
    expect(within(tabs).getAllByRole('link').map((link) => link.textContent)).toEqual(NAV_ITEMS.map((i) => i.label))
    expect(within(tabs).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('names the current page for the phone header without adding a heading', () => {
    renderBar({ route: '/investors/stocks' })
    expect(screen.getByText('Investors', { selector: 'p' })).toHaveClass('min-[760px]:hidden')
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('opens the palette from the Search pill', async () => {
    const onOpenPalette = vi.fn()
    renderBar({ onOpenPalette })
    await userEvent.click(screen.getByRole('button', { name: /Search/ }))
    expect(onOpenPalette).toHaveBeenCalledTimes(1)
  })

  it('shows the Saxo account value, positions plus Saxo cash, linking to Portfolio', () => {
    renderBar()
    const pill = screen.getByRole('link', { name: /Saxo account value/ })
    expect(pill).toHaveAttribute('href', '/portfolio')
    expect(pill).toHaveTextContent(fmtEur(42634.84))
  })

  it('shows a dash rather than a partial value when the cash is unknown', () => {
    queries.useNetWorth.mockReturnValue({ data: undefined })
    renderBar()
    const pill = screen.getByRole('link', { name: /Saxo account value/ })
    expect(pill).toHaveTextContent('—')
    expect(pill).not.toHaveTextContent('€')
  })

  it('shows cash across accounts, linking to Money and hidden below 1420px', () => {
    renderBar()
    const pill = screen.getByRole('link', { name: /Cash across accounts/ })
    expect(pill).toHaveAttribute('href', '/money')
    expect(pill).toHaveTextContent(fmtEur(821.54))
    expect(pill).toHaveClass('hidden', 'min-[1420px]:inline-flex')
  })

  it('carries the Saxo status on the account button', () => {
    queries.useSaxoStatus.mockReturnValue({ data: { connected: false } })
    renderBar()
    expect(screen.getByRole('button', { name: 'Account, Saxo not connected' })).toBeInTheDocument()
  })

  it('offers the filing alerts bell', () => {
    renderBar()
    expect(screen.getByRole('button', { name: 'Filing alerts' })).toBeInTheDocument()
  })
})

describe('account menu', () => {
  it('shows reconnect when Saxo needs re-auth', async () => {
    queries.useSaxoStatus.mockReturnValue({ data: { connected: true, needs_reauth: true } })
    renderBar()
    const menu = await openAccountMenu()
    expect(within(menu).getByText('Saxo needs reconnecting')).toBeInTheDocument()
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Reconnect/ }))
    expect(connectSaxo).toHaveBeenCalledTimes(1)
  })

  it('offers no reconnect while Saxo is healthy', async () => {
    renderBar()
    const menu = await openAccountMenu()
    expect(within(menu).getByText('Saxo connected')).toBeInTheDocument()
    expect(within(menu).queryByText(/Reconnect/)).not.toBeInTheDocument()
  })

  it('opens Settings from Theme and colours', async () => {
    renderBar()
    await openAccountMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Theme and colours' }))
    expect(screen.getByText('Settings page')).toBeInTheDocument()
  })

  it('lists sync health and signs out to the login page', async () => {
    renderBar()
    const menu = await openAccountMenu()
    expect(within(menu).getByRole('menuitem', { name: 'Sync health' })).toBeInTheDocument()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })

  it('credits elbstream.com for the instrument logos', async () => {
    renderBar()
    const menu = await openAccountMenu()
    expect(within(menu).getByRole('menuitem', { name: /elbstream\.com/ })).toHaveAttribute(
      'href',
      'https://elbstream.com/logos',
    )
  })
})
