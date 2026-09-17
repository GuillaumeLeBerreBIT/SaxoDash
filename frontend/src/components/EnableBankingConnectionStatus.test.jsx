import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import EnableBankingConnectionStatus from './EnableBankingConnectionStatus'

vi.mock('../api/queries')
import * as queries from '../api/queries'

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
    window.history.replaceState({}, '', '/accounts?enablebanking=error&bank=kbc')
    queries.useEnableBankingStatus.mockReturnValue({
      data: { kbc: { connected: false }, argenta: { connected: false } },
    })
    renderWithProviders(<EnableBankingConnectionStatus />)
    expect(screen.getByText('KBC connection failed')).toBeInTheDocument()
    expect(screen.queryByText('Argenta connection failed')).not.toBeInTheDocument()
  })

  it('clears the error params from the URL after reading them', () => {
    window.history.replaceState({}, '', '/accounts?enablebanking=error&bank=kbc')
    queries.useEnableBankingStatus.mockReturnValue({
      data: { kbc: { connected: false }, argenta: { connected: false } },
    })
    renderWithProviders(<EnableBankingConnectionStatus />)
    expect(window.location.search).toBe('')
  })
})
