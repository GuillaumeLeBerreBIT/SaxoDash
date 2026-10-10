import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import SubscriptionsList from './SubscriptionsList'

const subs = [
  { id: 1, display_name: 'Netflix', cadence: 'monthly', expected_amount: '15.00' },
  { id: 2, display_name: 'Domain', cadence: 'yearly', expected_amount: '120.00' },
]

describe('SubscriptionsList', () => {
  it('shows the combined monthly cost', () => {
    render(<SubscriptionsList subscriptions={subs} onDismiss={() => {}} />)
    expect(screen.getByText('≈ €25.00 / month')).toBeInTheDocument()
  })

  it('shows no total when there are no subscriptions', () => {
    render(<SubscriptionsList subscriptions={[]} onDismiss={() => {}} />)
    expect(screen.queryByText(/\/ month/)).not.toBeInTheDocument()
  })
})
