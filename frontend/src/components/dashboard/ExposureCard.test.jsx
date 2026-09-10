import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ExposureCard from './ExposureCard'

const base = {
  sector: [
    { name: 'Technology', pct: 90, value: '9000.00' },
    { name: 'Staples', pct: 10, value: '1000.00' },
  ],
  concentration: { top1: { ticker: 'NVDA', pct: 60 }, top3_pct: 100, hhi: 0.46, positions: 3 },
}

describe('ExposureCard', () => {
  it('lists sectors and a concentration caption', () => {
    render(
      <ExposureCard
        {...base}
        currency={[
          { currency: 'USD', pct: 90, value: '9000.00' },
          { currency: 'EUR', pct: 10, value: '1000.00' },
        ]}
      />,
    )
    expect(screen.getByText('Technology')).toBeInTheDocument()
    expect(screen.getByText(/Top 3: 100%/)).toBeInTheDocument()
    expect(screen.getByText(/HHI 0\.46/)).toBeInTheDocument()
  })

  it('shows a single currency as text, not a chart', () => {
    render(<ExposureCard {...base} currency={[{ currency: 'EUR', pct: 100, value: '10000.00' }]} />)
    expect(screen.getByText(/100% EUR/)).toBeInTheDocument()
  })
})
