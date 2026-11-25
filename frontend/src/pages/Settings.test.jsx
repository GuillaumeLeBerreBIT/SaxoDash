import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import Settings from './Settings'
import { ThemeProvider } from '../theme/ThemeProvider'

vi.mock('../api/queries')
import * as queries from '../api/queries'

vi.mock('../components/settings/AccountSettings', () => ({ default: () => <h2>Profile</h2> }))
vi.mock('../api/client', () => ({
  connectSaxo: vi.fn(),
}))
import { connectSaxo } from '../api/client'

const HEALTHY = { connected: true, usable: true, needs_reauth: false, last_sync_outcome: 'ok', failing_syncs: [] }

function renderSettings(route = '/settings') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[route]}>
          <Settings />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  queries.useSaxoStatus.mockReturnValue({ data: HEALTHY })
  queries.useMe.mockReturnValue({ data: { username: 'demo', email: 'd@example.com', is_owner: true } })
  queries.useClearAccountHistory.mockReturnValue({ mutate: vi.fn(), isPending: false })
})

describe('Settings', () => {
  it('lists Account first and opens it on request', () => {
    renderSettings('/settings?section=account')
    const sections = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(sections).getAllByRole('button')[0]).toHaveTextContent('Account')
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
  })

  it('lists Saxo as the only connection, with no bank rows', () => {
    renderSettings('/settings?section=connections')
    const connections = screen.getByRole('heading', { name: 'Connections' }).closest('.sd-panel')
    expect(within(connections).queryByText(/KBC|Argenta|bank/i)).not.toBeInTheDocument()
    expect(within(connections).queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument()
  })

  it('says the Saxo status is unavailable when the status request fails, rather than checking forever', () => {
    queries.useSaxoStatus.mockReturnValue({ data: undefined, isError: true })
    renderSettings('/settings?section=connections')
    expect(screen.getAllByText('Status unavailable').length).toBeGreaterThan(0)
    expect(screen.queryByText('Checking the connection…')).not.toBeInTheDocument()
  })

  it('says it is checking while the Saxo status loads', () => {
    queries.useSaxoStatus.mockReturnValue({ data: undefined, isError: false })
    renderSettings('/settings?section=connections')
    expect(screen.getByText('Checking the connection…')).toBeInTheDocument()
  })

  it('theme cards switch the theme', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: /Graphite Blue/ }))
    expect(document.documentElement.dataset.theme).toBe('blue')
    expect(screen.getByRole('button', { name: /Graphite Blue/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Republic/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('gain and loss colours toggle cvd', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: /Blue \/ orange/ }))
    expect(document.documentElement.dataset.moves).toBe('cvd')
    expect(screen.getByRole('button', { name: /Blue \/ orange/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('usual P/E colours pick from blue, orange, violet and yellow, never green or red', async () => {
    renderSettings()
    expect(screen.queryAllByRole('button', { name: /^(Green|Red)$/ })).toHaveLength(0)
    await userEvent.click(screen.getAllByRole('button', { name: 'Violet' })[1])
    expect(JSON.parse(localStorage.getItem('saxodash:appearance')).expensiveBand).toBe('violet')
    expect(screen.getAllByRole('button', { name: 'Violet' })[1]).toHaveAttribute('aria-pressed', 'true')
  })

  it('density toggles compact', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(document.documentElement.dataset.density).toBe('compact')
  })

  it('sync health lists failing tasks', async () => {
    queries.useSaxoStatus.mockReturnValue({ data: { ...HEALTHY, last_sync_outcome: 'failed', failing_syncs: ['sync_positions'] } })
    renderSettings('/settings?section=sync')
    const row = screen.getByText('sync_positions').closest('li')
    expect(row).toHaveTextContent('failing')
    expect(row.querySelector('.bg-warn')).not.toBeNull()
  })

  it('connections show Saxo needs re-authentication with a Reconnect button', async () => {
    queries.useSaxoStatus.mockReturnValue({ data: { ...HEALTHY, needs_reauth: true, usable: false } })
    renderSettings('/settings?section=connections')
    expect(screen.getByText('Saxo needs re-authentication')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(connectSaxo).toHaveBeenCalledTimes(1)
  })

  it('sync health says the status is unavailable when the Saxo status request fails', () => {
    queries.useSaxoStatus.mockReturnValue({ data: undefined, isError: true })
    renderSettings('/settings?section=sync')
    const health = screen.getByRole('heading', { name: 'Sync health' }).closest('.sd-panel')
    expect(within(health).getAllByText('Status unavailable')).toHaveLength(1)
    expect(screen.queryByText(/Nothing is connected/)).not.toBeInTheDocument()
  })

  it('sync health keeps the empty message when nothing is connected and the requests succeeded', () => {
    queries.useSaxoStatus.mockReturnValue({ data: { connected: false } })
    renderSettings('/settings?section=sync')
    expect(screen.getByText(/Nothing is connected/)).toBeInTheDocument()
  })

  it('connections report Connection failed when starting the Saxo connection throws', async () => {
    queries.useSaxoStatus.mockReturnValue({ data: { connected: false } })
    connectSaxo.mockRejectedValueOnce(new Error('boom'))
    renderSettings('/settings?section=connections')
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }))
    expect(await screen.findByText('Connection failed')).toBeInTheDocument()
  })

  it('shows connections and sync health in one section, and still opens it from an old sync link', async () => {
    renderSettings()
    expect(screen.queryByRole('button', { name: 'Sync health' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Connections' }))
    expect(screen.getByRole('heading', { name: 'Connections' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sync health' })).toBeInTheDocument()
  })

  it('clears the Saxo account history from the connections card', async () => {
    const mutate = vi.fn()
    queries.useClearAccountHistory.mockReturnValue({ mutate, isPending: false })
    renderSettings('/settings?section=connections')
    await userEvent.click(screen.getByRole('button', { name: 'Clear account history' }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('credits the logo provider', () => {
    renderSettings()
    expect(screen.getByRole('link', { name: /elbstream\.com/ })).toHaveAttribute('href', 'https://elbstream.com')
  })
})
