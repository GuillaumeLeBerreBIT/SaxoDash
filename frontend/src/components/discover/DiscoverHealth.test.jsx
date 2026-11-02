import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import DiscoverHealth from './DiscoverHealth'

describe('DiscoverHealth', () => {
  it('stale scan shows its date and the reason', () => {
    render(<DiscoverHealth health={{ state: 'stale', issue: 'Saxo needs re-authentication' }} asOf="2026-10-20T12:00:00Z" />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('No fresh scan since 20 Oct.')
    expect(status).toHaveTextContent('Last attempt: Saxo needs re-authentication')
  })

  it('stays silent for a healthy scan', () => {
    render(<DiscoverHealth health={{ state: 'ok' }} asOf="2026-10-20T12:00:00Z" />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
