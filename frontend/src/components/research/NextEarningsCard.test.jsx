import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import NextEarningsCard from './NextEarningsCard'

const withNext = {
  isLoading: false,
  data: { available: true, next: { date: '2026-11-19', session: 'amc', eps_estimate: 1.25, revenue_estimate: 54_000_000_000 } },
}

describe('NextEarningsCard', () => {
  it('shows the next earnings date with the estimates from the calendar', () => {
    render(<NextEarningsCard earnings={withNext} />)

    expect(screen.getByRole('heading', { name: 'Next earnings' })).toBeInTheDocument()
    expect(screen.getByText(/EPS est\. 1\.25/)).toBeInTheDocument()
  })

  it('says so when no report is scheduled', () => {
    render(<NextEarningsCard earnings={{ isLoading: false, data: { available: true, next: null } }} />)

    expect(screen.getByText('No scheduled earnings date for this symbol.')).toBeInTheDocument()
  })

  it('leaves the card out when the calendar is not available', () => {
    const { container } = render(<NextEarningsCard earnings={{ isLoading: false, data: { available: false } }} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('opens the earnings history', async () => {
    const onOpenTab = vi.fn()
    render(<NextEarningsCard earnings={withNext} onOpenTab={onOpenTab} />)

    await userEvent.click(screen.getByRole('button', { name: /Earnings history/ }))
    expect(onOpenTab).toHaveBeenCalledWith('earnings')
  })
})
