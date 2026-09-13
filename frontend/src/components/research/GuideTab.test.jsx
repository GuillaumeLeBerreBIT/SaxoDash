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
})
