import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ExposureCard from './ExposureCard'

const concentration = { top1: { ticker: 'NVDA', pct: 60 }, top3_pct: 100, hhi: 0.46, positions: 3 }

describe('ExposureCard', () => {
  it('lists currencies and a concentration caption under its own title', () => {
    render(
      <ExposureCard
        concentration={concentration}
        currency={[
          { currency: 'USD', pct: 90, value: '9000.00' },
          { currency: 'EUR', pct: 10, value: '1000.00' },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Currency & concentration' })).toBeInTheDocument()
    expect(screen.getByText('USD')).toBeInTheDocument()
    expect(screen.getByText(/Top 3: 100%/)).toBeInTheDocument()
    expect(screen.getByText(/HHI 0\.46/)).toBeInTheDocument()
  })

  it('shows a single currency as text, not a legend', () => {
    render(<ExposureCard concentration={concentration} currency={[{ currency: 'EUR', pct: 100, value: '10000.00' }]} />)
    expect(screen.getByText(/100% EUR/)).toBeInTheDocument()
  })

  it('shows an empty state with no holdings', () => {
    render(<ExposureCard concentration={{}} currency={[]} />)
    expect(screen.getByText('No holdings yet.')).toBeInTheDocument()
  })
})
