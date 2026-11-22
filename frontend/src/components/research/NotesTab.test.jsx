import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import NotesTab from './NotesTab'

const risingBars = (count) =>
  Array.from({ length: count }, (_, index) => {
    const day = new Date(Date.UTC(2026, 9, 9) - (count - 1 - index) * 86_400_000)
    const close = 100 + index
    return { date: day.toISOString().slice(0, 10), open: close, high: close, low: close, close, volume: 1000 }
  })

const hold = { action: 'hold', reason: 'x', quality: 'strong', valuation: 'expensive', as_of: '2026-11-10', checks: [], held: false }

describe('NotesTab trade plan', () => {
  it('keeps the trade plan closed unless the company passes the quality screen and is under the cap', () => {
    render(
      <NotesTab
        eligible
        verdict={{ isLoading: false, data: hold }}
        bars={risingBars(40)}
        details={{ currency: 'USD' }}
      />,
    )

    expect(screen.getByText(/Closed unless the company passes the quality screen and is under your cap/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show the trade plan' }))
    expect(screen.queryByText(/Closed unless the company passes the quality screen and is under your cap/)).not.toBeInTheDocument()
  })
})
