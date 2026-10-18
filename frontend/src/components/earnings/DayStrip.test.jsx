import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import DayStrip from './DayStrip'
import { WEEKDAYS } from '../../lib/earnings'

describe('DayStrip', () => {
  it('shows each day with its count and selects on tap', async () => {
    const onSelect = vi.fn()
    render(
      <DayStrip days={WEEKDAYS.slice(0, 5)} counts={{ mon: 4 }} windowFrom="2026-10-26" selectedDay="mon" onSelect={onSelect} />,
    )
    expect(screen.getByRole('button', { name: '4 reporting on Mon 26' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: '0 reporting on Wed 28' }))
    expect(onSelect).toHaveBeenCalledWith('wed')
  })
})
