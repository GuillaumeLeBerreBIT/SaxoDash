import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'
import FilingAlerts from './FilingAlerts'

const berkshire = {
  id: 7,
  investor: { slug: 'berkshire-hathaway', name: 'Warren Buffett', firm: 'Berkshire Hathaway' },
  quarter: '2026-06-30',
  filed_on: '2026-08-14',
  read: false,
  counts: { new: 1, added: 1, trimmed: 0, sold_out: 2 },
  moves: [
    { cusip: '67066G104', put_call: '', ticker: 'NVDA', issuer: 'NVIDIA CORP', kind: 'new', shares_change_pct: null },
    { cusip: '999999999', put_call: '', ticker: null, issuer: 'ACME CORP', kind: 'added', shares_change_pct: 50 },
  ],
}
const pershing = {
  ...berkshire, id: 8, read: true, moves: [], counts: { new: 0, added: 0, trimmed: 0, sold_out: 0 },
  investor: { slug: 'pershing-square', name: 'Bill Ackman', firm: 'Pershing Square' },
}

const mutate = vi.fn()

function renderBell(inbox) {
  queries.useFilingAlerts.mockReturnValue({ data: inbox })
  queries.useMarkAlertsRead.mockReturnValue({ mutate })
  return render(<MemoryRouter><FilingAlerts /></MemoryRouter>)
}

const openPanel = (name) => fireEvent.click(screen.getByRole('button', { name }))

describe('FilingAlerts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('counts unread filings on the bell and in its name', () => {
    renderBell({ unread: 2, alerts: [berkshire] })
    expect(screen.getByRole('button', { name: 'Filing alerts, 2 unread' })).toHaveTextContent('2')
  })

  it('shows no count when everything is read or still loading', () => {
    renderBell(undefined)
    expect(screen.getByRole('button', { name: 'Filing alerts' })).toHaveTextContent('')
  })

  it('caps a long count', () => {
    renderBell({ unread: 14, alerts: [] })
    expect(screen.getByRole('button', { name: 'Filing alerts, 14 unread' })).toHaveTextContent('9+')
  })

  it('lists who filed, for which quarter, and the biggest moves', () => {
    renderBell({ unread: 1, alerts: [berkshire] })
    openPanel('Filing alerts, 1 unread')
    const row = within(screen.getByRole('dialog', { name: 'Filing alerts' })).getByRole('link')
    expect(row).toHaveAttribute('href', '/investors/berkshire-hathaway?quarter=2026-06-30')
    expect(row).toHaveTextContent('Warren Buffett')
    expect(row).toHaveTextContent('Q2 2026')
    expect(row).toHaveTextContent('1 new · 1 added · 2 sold out')
    expect(row).toHaveTextContent('NVDA')
    expect(row).toHaveTextContent('ACME CORP')
    expect(within(row).getByText('Unread')).toBeInTheDocument()
  })

  it('does not call a read filing unread, and says so when nothing changed', () => {
    renderBell({ unread: 0, alerts: [pershing] })
    openPanel('Filing alerts')
    const row = screen.getByRole('link')
    expect(within(row).queryByText('Unread')).toBeNull()
    expect(row).toHaveTextContent('No position changes')
  })

  it('explains an empty inbox', () => {
    renderBell({ unread: 0, alerts: [] })
    openPanel('Filing alerts')
    expect(screen.getByText(/Follow an investor to hear when they file/)).toBeInTheDocument()
  })

  it('keeps filings unread while the panel is open and marks them read on close', () => {
    renderBell({ unread: 1, alerts: [berkshire] })
    openPanel('Filing alerts, 1 unread')
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('closes on a click outside and when a filing is picked', () => {
    renderBell({ unread: 1, alerts: [berkshire] })
    openPanel('Filing alerts, 1 unread')
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
    openPanel('Filing alerts, 1 unread')
    fireEvent.click(screen.getByRole('link'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mutate).toHaveBeenCalledTimes(2)
  })

  it('opens beside the sidebar when told where its edge is', () => {
    queries.useFilingAlerts.mockReturnValue({ data: { unread: 0, alerts: [] } })
    queries.useMarkAlertsRead.mockReturnValue({ mutate })
    render(<MemoryRouter><FilingAlerts side="right" panelLeft={228} /></MemoryRouter>)
    openPanel('Filing alerts')
    expect(screen.getByRole('dialog').style.left).toBe('228px')
  })

  it('does not write when there was nothing unread', () => {
    renderBell({ unread: 0, alerts: [pershing] })
    openPanel('Filing alerts')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mutate).not.toHaveBeenCalled()
  })
})
