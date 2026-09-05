import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReturnsTable from './ReturnsTable'

const periods = [
  { label: '1 month', portfolio_pct: 5.1, benchmark_pct: 3.2, alpha_pct: 1.9, annualised: false },
  { label: 'Since inception', portfolio_pct: null, benchmark_pct: null, alpha_pct: null, annualised: false },
]

describe('ReturnsTable', () => {
  it('shows each period with portfolio, benchmark and alpha', () => {
    render(<ReturnsTable periods={periods} benchmarkName="World Index" />)

    expect(screen.getByText('1 month')).toBeInTheDocument()
    expect(screen.getByText('+5.1%')).toBeInTheDocument()
    expect(screen.getByText('+3.2%')).toBeInTheDocument()
    expect(screen.getByText('+1.9%')).toBeInTheDocument()
  })

  it('shows a dash rather than a claim when a period has no data', () => {
    render(<ReturnsTable periods={periods} benchmarkName="World Index" />)

    const row = screen.getByText('Since inception').closest('tr')
    expect(row).toHaveTextContent('—')
  })
})
