import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders'
import UpcomingEarnings from './UpcomingEarnings'

describe('UpcomingEarnings', () => {
  it('renders nothing when the feed was unavailable (null)', () => {
    const { container } = renderWithProviders(<UpcomingEarnings items={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the two-week line when nothing is scheduled', () => {
    renderWithProviders(<UpcomingEarnings items={[]} />)
    expect(screen.getByText(/No holdings report in the next 2 weeks/)).toBeInTheDocument()
  })

  it('links each row to the Research earnings tab', () => {
    renderWithProviders(
      <UpcomingEarnings
        items={[{ ticker: 'MSFT', date: '2026-09-13', days_until: 3, session: 'amc', eps_estimate: 3.1 }]}
      />,
    )
    expect(screen.getByRole('link', { name: /MSFT/ })).toHaveAttribute(
      'href', '/research?symbol=MSFT&tab=earnings',
    )
    expect(screen.getByText(/in 3 days/)).toBeInTheDocument()
  })
})
