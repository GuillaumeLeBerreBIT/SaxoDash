import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import GuideTab from './GuideTab'

describe('GuideTab', () => {
  it('renders every reference section', () => {
    render(<GuideTab />)

    expect(screen.getByText('Investment snapshot')).toBeInTheDocument()
    expect(screen.getByText('Ratios')).toBeInTheDocument()
    expect(screen.getByText('Quality vs. valuation quadrant')).toBeInTheDocument()
    expect(screen.getByText('Earnings signals')).toBeInTheDocument()
    expect(screen.getByText('Putting it together')).toBeInTheDocument()
    expect(screen.getByText('Chart signals')).toBeInTheDocument()
  })

  it('names all five snapshot groups', () => {
    render(<GuideTab />)

    for (const label of ['Growth', 'Profitability', 'Financial health', 'Valuation', 'Momentum']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('renders the quadrant corners', () => {
    render(<GuideTab />)

    expect(screen.getByText(/High quality, cheap/)).toBeInTheDocument()
    expect(screen.getByText(/Low quality, expensive/)).toBeInTheDocument()
  })

  it('lists every tested signal under its grade when the scores are in', () => {
    const signal = (key, label, grade) => ({
      key, label, grade, kind: 'event', description: `About ${label}`, horizons: { 60: { mean_excess: 0.014, cases: 7657 } },
    })
    render(<GuideTab signals={[signal('macd_cross_up', 'MACD bullish cross', 'no_edge'), signal('volume_thrust', 'Volume thrust', 'supported')]} />)

    expect(screen.getByText('Signals tested')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Held up in testing' })).toHaveTextContent('Volume thrust')
    expect(screen.getByRole('region', { name: 'No edge found' })).toHaveTextContent('No edge found in 7,657 cases')
  })

  it('leaves the list out before any scores exist', () => {
    render(<GuideTab />)
    expect(screen.queryByText('Signals tested')).not.toBeInTheDocument()
  })
})
