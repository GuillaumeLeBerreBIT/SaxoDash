import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import HeroValue from './HeroValue'

const base = {
  value: { net_worth: '10000.00', portfolio: '9000.00', bank: '1000.00' },
  change: {
    day: { abs: '50.00', pct: 0.56 },
    week: { abs: '-120.00', pct: -1.3 },
    month: null,
    ytd: { abs: '800.00', pct: 9.0 },
  },
  spark: [{ date: '2026-09-08', value: 9900 }, { date: '2026-09-09', value: 10000 }],
}

describe('HeroValue', () => {
  it('shows the net worth and a green and a red delta', () => {
    render(<HeroValue {...base} />)
    expect(screen.getByText('€10,000.00')).toBeInTheDocument()
    expect(screen.getByText(/\+0\.56%/)).toBeInTheDocument()
    expect(screen.getByText(/-1\.30%/)).toBeInTheDocument()
  })

  it('renders an em dash for a null delta', () => {
    render(<HeroValue {...base} />)
    expect(screen.getByText('Month').closest('div')).toHaveTextContent('—')
  })

  it('omits the sparkline when there is no series', () => {
    const { container } = render(<HeroValue {...base} spark={[]} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
