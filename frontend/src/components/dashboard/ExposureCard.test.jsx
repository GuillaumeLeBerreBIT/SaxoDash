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

  it('caps the sector legend at 5 slices plus an Other bucket for the remainder', () => {
    const manySectors = [
      { name: 'Technology', pct: 30, value: '3000.00' },
      { name: 'Healthcare', pct: 20, value: '2000.00' },
      { name: 'Financials', pct: 15, value: '1500.00' },
      { name: 'Energy', pct: 10, value: '1000.00' },
      { name: 'Industrials', pct: 8, value: '800.00' },
      { name: 'Utilities', pct: 7, value: '700.00' },
      { name: 'Staples', pct: 6, value: '600.00' },
      { name: 'Materials', pct: 4, value: '400.00' },
    ]
    render(<ExposureCard sector={manySectors} currency={[]} concentration={{}} />)

    expect(screen.getByText('Technology')).toBeInTheDocument()
    expect(screen.getByText('Industrials')).toBeInTheDocument()
    expect(screen.queryByText('Utilities')).not.toBeInTheDocument()
    expect(screen.queryByText('Staples')).not.toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
    // Utilities(7) + Staples(6) + Materials(4) rolled into one Other slice
    expect(screen.getByText('17%')).toBeInTheDocument()
  })
})
