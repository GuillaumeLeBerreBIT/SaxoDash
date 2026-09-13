import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import QualityValuationQuadrant from './QualityValuationQuadrant'

describe('QualityValuationQuadrant', () => {
  it('renders nothing with fewer than two points', () => {
    const { container } = render(
      <QualityValuationQuadrant points={[{ symbol: 'AAPL', quality: 80, valuation: 60, isSelf: true }]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the chart card with two or more points', () => {
    render(
      <QualityValuationQuadrant
        points={[
          { symbol: 'AAPL', quality: 80, valuation: 60, isSelf: true },
          { symbol: 'MSFT', quality: 75, valuation: 55, isSelf: false },
        ]}
      />,
    )
    expect(screen.getByText('Quality vs. valuation')).toBeInTheDocument()
  })
})
