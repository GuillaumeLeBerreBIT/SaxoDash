import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../api/queries')
vi.mock('../api/client', () => ({ connectSaxo: vi.fn() }))
import * as queries from '../api/queries'
import { connectSaxo } from '../api/client'
import SaxoConnectionStatus from './SaxoConnectionStatus'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

const healthy = { connected: true, needs_reauth: false, usable: true, last_sync_outcome: 'ok' }

const CASES = [
  ['connected', healthy, 'Saxo connected', 'bg-ok'],
  ['a failed sync', { ...healthy, last_sync_outcome: 'failed' }, 'Saxo connected, sync failed', 'bg-warn'],
  ['reconnecting', { ...healthy, usable: false }, 'Saxo reconnecting…', 'bg-warn'],
  ['needs reauth', { ...healthy, needs_reauth: true, usable: false }, 'Saxo needs re-authentication', 'bg-warn'],
  ['not connected', { connected: false }, 'Saxo not connected', 'bg-ink-3'],
]

function mockStatus(data) {
  queries.useSaxoStatus.mockReturnValue({ data })
}

describe('SaxoConnectionStatus compact', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(CASES)('exposes %s as a named status with a tone', (_, data, sentence, tone) => {
    mockStatus(data)
    render(<SaxoConnectionStatus compact />)
    const status = screen.getByRole('status', { name: sentence })
    expect(status).toHaveAttribute('title', sentence)
    expect(status.querySelector('.sr-only')).toHaveTextContent(sentence)
    expect(status.querySelector('.rounded-full')).toHaveClass(tone, 'w-2', 'h-2')
  })

  it.each([
    ['needs reauth', { ...healthy, needs_reauth: true, usable: false }, 'Saxo needs re-authentication'],
    ['not connected', { connected: false }, 'Saxo not connected'],
    ['reconnecting', { ...healthy, usable: false }, 'Saxo reconnecting…'],
  ])('links the %s dot to the portfolio with a touch-sized target', (_, data, sentence) => {
    mockStatus(data)
    render(<SaxoConnectionStatus compact />)
    const link = screen.getByRole('link', { name: sentence })
    expect(link).toHaveAttribute('href', '/portfolio')
    expect(link).toHaveClass('inline-flex', 'min-h-10', 'min-w-10', 'items-center', 'justify-center', 'md:min-h-0', 'md:min-w-0')
    expect(screen.getByRole('status', { name: sentence })).toBeInTheDocument()
  })

  it.each([
    ['connected', healthy],
    ['a failed sync', { ...healthy, last_sync_outcome: 'failed' }],
  ])('keeps the %s dot a plain status', (_, data) => {
    mockStatus(data)
    render(<SaxoConnectionStatus compact />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders nothing while the status is loading', () => {
    mockStatus(undefined)
    const { container } = render(<SaxoConnectionStatus compact />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers no connect button', () => {
    mockStatus({ connected: false })
    render(<SaxoConnectionStatus compact />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('SaxoConnectionStatus full badge', () => {
  it('says nothing while the connection is healthy, so the badge only ever means a problem', () => {
    mockStatus(healthy)
    const { container } = render(<SaxoConnectionStatus />)
    expect(container).toBeEmptyDOMElement()
  })

  it('explains an incomplete sync as figures from the last complete sync', () => {
    mockStatus({ ...healthy, last_sync_outcome: 'incomplete', last_synced_at: null })
    render(<SaxoConnectionStatus />)
    expect(screen.getByText('Sync incomplete')).toHaveAttribute(
      'title',
      'The last sync could not read every position, so these figures are from the last complete sync',
    )
  })

  it('shows Connection failed when starting the connection throws', async () => {
    mockStatus({ connected: false })
    connectSaxo.mockRejectedValueOnce(new Error('boom'))
    render(<SaxoConnectionStatus />)
    await userEvent.click(screen.getByRole('button', { name: 'Connect Saxo' }))
    expect(await screen.findByText('Connection failed')).toBeInTheDocument()
  })

  it('still offers Connect Saxo when disconnected', () => {
    mockStatus({ connected: false })
    render(<SaxoConnectionStatus />)
    expect(screen.getByRole('button', { name: 'Connect Saxo' })).toBeInTheDocument()
  })
})

describe('SaxoConnectionStatus failed-connect param', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/portfolio?saxo=error')
    mockStatus({ connected: false })
  })

  it('is left in the URL by compact dots so the full badge can still report it', () => {
    render(<><SaxoConnectionStatus compact /><SaxoConnectionStatus compact /></>)
    expect(window.location.search).toBe('?saxo=error')
    expect(screen.queryByText('Connection failed')).not.toBeInTheDocument()
  })

  it('is read and stripped by the full badge mounting after the dots', () => {
    const dots = render(<SaxoConnectionStatus compact />)
    dots.unmount()
    render(<SaxoConnectionStatus />)
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })
})
