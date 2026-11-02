import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { renderWithProviders } from '../test/renderWithProviders'
import EnableBankingConnectionStatus from './EnableBankingConnectionStatus'

vi.mock('../api/queries')
import * as queries from '../api/queries'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

describe('EnableBankingConnectionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/accounts')
  })

  it('renders nothing before status has loaded', () => {
    queries.useEnableBankingStatus.mockReturnValue({ data: undefined })
    const { container } = renderWithProviders(<EnableBankingConnectionStatus />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a Connect button for a bank that is not connected', () => {
    queries.useEnableBankingStatus.mockReturnValue({
      data: { kbc: { connected: false }, argenta: { connected: false } },
    })
    renderWithProviders(<EnableBankingConnectionStatus />)
    expect(screen.getByText('Connect KBC')).toBeInTheDocument()
    expect(screen.getByText('Connect Argenta')).toBeInTheDocument()
  })

  it('shows a connected badge for a bank that is connected and usable', () => {
    queries.useEnableBankingStatus.mockReturnValue({
      data: {
        kbc: { connected: true, needs_reauth: false, usable: true, last_synced_at: null },
        argenta: { connected: false },
      },
    })
    renderWithProviders(<EnableBankingConnectionStatus />)
    expect(screen.getByText('KBC connected')).toBeInTheDocument()
    expect(screen.getByText('Connect Argenta')).toBeInTheDocument()
  })

  it('shows a Reconnect button for a bank that needs re-authentication', () => {
    queries.useEnableBankingStatus.mockReturnValue({
      data: {
        kbc: { connected: true, needs_reauth: true, usable: false },
        argenta: { connected: false },
      },
    })
    renderWithProviders(<EnableBankingConnectionStatus />)
    expect(screen.getByText('Reconnect KBC')).toBeInTheDocument()
  })

  it('shows a failure badge for the bank named in a ?enablebanking=error redirect', () => {
    queries.useEnableBankingStatus.mockReturnValue({
      data: { kbc: { connected: false }, argenta: { connected: false } },
    })
    renderWithProviders(<EnableBankingConnectionStatus />, { route: '/money?section=accounts&enablebanking=error&bank=kbc' })
    expect(screen.getByText('KBC connection failed')).toBeInTheDocument()
    expect(screen.queryByText('Argenta connection failed')).not.toBeInTheDocument()
  })

  it('clears only the error params from the URL, keeping the Money section', () => {
    queries.useEnableBankingStatus.mockReturnValue({
      data: { kbc: { connected: false }, argenta: { connected: false } },
    })
    renderWithProviders(
      <>
        <EnableBankingConnectionStatus />
        <Where />
      </>,
      { route: '/money?section=accounts&enablebanking=error&bank=kbc' },
    )
    expect(screen.getByText('KBC connection failed')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/money\?section=accounts$/)
  })

  it('shows a single sync-failed badge when a bank is connected but its last sync failed', () => {
    queries.useEnableBankingStatus.mockReturnValue({
      data: {
        kbc: {
          connected: true, needs_reauth: false, usable: true, last_synced_at: null,
          last_sync_outcome: 'failed', failing_syncs: ['balances'],
        },
        argenta: { connected: false },
      },
    })
    renderWithProviders(<EnableBankingConnectionStatus />)
    expect(screen.getByText('KBC sync failed')).toBeInTheDocument()
    expect(screen.queryByText('KBC connected')).not.toBeInTheDocument()
  })

  it('omits the sync-failed badge when the last sync succeeded', () => {
    queries.useEnableBankingStatus.mockReturnValue({
      data: {
        kbc: {
          connected: true, needs_reauth: false, usable: true, last_synced_at: null,
          last_sync_outcome: 'ok', failing_syncs: [],
        },
        argenta: { connected: false },
      },
    })
    renderWithProviders(<EnableBankingConnectionStatus />)
    expect(screen.queryByText('KBC sync failed')).not.toBeInTheDocument()
  })

  it('wraps its badges instead of overflowing a narrow header', () => {
    queries.useEnableBankingStatus.mockReturnValue({
      data: { kbc: { connected: false }, argenta: { connected: false } },
    })
    renderWithProviders(<EnableBankingConnectionStatus />)

    expect(screen.getByText('Connect KBC').closest('span.flex')).toHaveClass('flex-wrap', 'justify-end')
  })

})
