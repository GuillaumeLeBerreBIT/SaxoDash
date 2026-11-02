import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../api/queries')
vi.mock('../api/client', () => ({ connectSaxo: vi.fn() }))
import * as queries from '../api/queries'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import { SAXO_DOT_CLASS, deriveSaxoStatus } from './saxoStatus'

const ok = { connected: true, needs_reauth: false, usable: true, last_sync_outcome: 'ok' }

const STATES = [
  ['connected ok', ok, 'connected', 'Saxo connected', ['Saxo connected']],
  ['connected, skipped', { ...ok, last_sync_outcome: 'skipped' }, 'sync_degraded', 'Saxo connected, sync skipped', ['Sync skipped', 'Saxo connected']],
  ['connected, failed', { ...ok, last_sync_outcome: 'failed' }, 'sync_degraded', 'Saxo connected, sync failed', ['Sync failed', 'Saxo connected']],
  ['needs reauth', { ...ok, needs_reauth: true, usable: false }, 'needs_reauth', 'Saxo needs re-authentication', ['Reconnect Saxo']],
  ['reconnecting', { ...ok, usable: false }, 'reconnecting', 'Saxo reconnecting…', ['Reconnecting…']],
  ['not connected', { connected: false }, 'not_connected', 'Saxo not connected', ['Connect Saxo']],
]

describe('deriveSaxoStatus', () => {
  it('is null while loading', () => {
    expect(deriveSaxoStatus(undefined)).toBeNull()
  })

  it.each(STATES)('%s', (_, data, kind, sentence, visible) => {
    expect(deriveSaxoStatus(data)).toMatchObject({ kind, sentence })
    queries.useSaxoStatus.mockReturnValue({ data })
    const { unmount } = render(createElement(MemoryRouter, null, createElement(SaxoConnectionStatus, { compact: true })))
    expect(screen.getByRole('status', { name: sentence })).toBeInTheDocument()
    unmount()
    const full = render(createElement(SaxoConnectionStatus))
    visible.forEach((text) => expect(screen.getByText(text)).toBeInTheDocument())
    full.unmount()
  })
})

describe('re-authentication tone', () => {
  it('is a warning, never an error', () => {
    const derived = deriveSaxoStatus({ ...ok, needs_reauth: true, usable: false })
    expect(derived.tone).toBe('amber')
    expect(SAXO_DOT_CLASS[derived.tone]).toBe('bg-warn')
  })
})
