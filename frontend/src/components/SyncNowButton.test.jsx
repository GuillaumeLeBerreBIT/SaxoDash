import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import SyncNowButton from './SyncNowButton'

vi.mock('../api/queries')
import * as queries from '../api/queries'

function mockSync(overrides = {}) {
  queries.useSyncNow.mockReturnValue({
    syncNow: vi.fn(), syncing: false, queueError: null, note: '', ...overrides,
  })
}

describe('SyncNowButton', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts a sync when clicked', () => {
    const syncNow = vi.fn()
    mockSync({ syncNow })
    renderWithProviders(<SyncNowButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(syncNow).toHaveBeenCalledTimes(1)
  })

  it('is disabled and says so while a sync is running', () => {
    mockSync({ syncing: true })
    renderWithProviders(<SyncNowButton />)
    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled()
  })

  it('shows why the queue could not be reached', () => {
    mockSync({ queueError: 'Could not start the sync. Is the worker running?' })
    renderWithProviders(<SyncNowButton />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not start the sync. Is the worker running?')
  })

  it('shows which bank could not sync and why', () => {
    mockSync({ note: 'KBC: session expired' })
    renderWithProviders(<SyncNowButton />)
    expect(screen.getByText('KBC: session expired')).toBeInTheDocument()
  })
})
