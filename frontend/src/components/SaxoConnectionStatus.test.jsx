import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../api/queries')
vi.mock('../api/client', () => ({ connectSaxo: vi.fn() }))
import * as queries from '../api/queries'
import SaxoConnectionStatus from './SaxoConnectionStatus'

const healthy = { connected: true, needs_reauth: false, usable: true, last_sync_outcome: 'ok' }

const CASES = [
  ['connected', healthy, 'Saxo connected', 'bg-emerald-400'],
  ['a failed sync', { ...healthy, last_sync_outcome: 'failed' }, 'Saxo connected, sync failed', 'bg-amber-400'],
  ['reconnecting', { ...healthy, usable: false }, 'Saxo reconnecting…', 'bg-amber-400'],
  ['needs reauth', { ...healthy, needs_reauth: true, usable: false }, 'Saxo needs reconnecting', 'bg-red-400'],
  ['not connected', { connected: false }, 'Saxo not connected', 'bg-zinc-500'],
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
  it('still shows its text', () => {
    mockStatus(healthy)
    render(<SaxoConnectionStatus />)
    expect(screen.getByText('Saxo connected')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('still offers Connect Saxo when disconnected', () => {
    mockStatus({ connected: false })
    render(<SaxoConnectionStatus />)
    expect(screen.getByRole('button', { name: 'Connect Saxo' })).toBeInTheDocument()
  })
})
