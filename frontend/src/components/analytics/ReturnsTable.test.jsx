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

  it('explains why a period is blank', () => {
    render(<ReturnsTable periods={[{ label: '1 year', portfolio_pct: null, benchmark_pct: null, alpha_pct: null, annualised: false, needs_days: 340 }]} benchmarkName="World" />)

    expect(screen.getByText('needs 340 more days')).toBeInTheDocument()
  })

  it('keeps period, portfolio and alpha visible below md and hides the benchmark', () => {
    render(<ReturnsTable periods={periods} benchmarkName="World Index" />)

    for (const name of ['Period', 'Portfolio', 'Alpha']) {
      expect(screen.getByRole('columnheader', { name })).not.toHaveClass('hidden')
    }
    expect(screen.getByRole('columnheader', { name: 'World Index' })).toHaveClass('hidden', 'md:table-cell')
    expect(screen.getByText('+3.2%').closest('td')).toHaveClass('hidden', 'md:table-cell')
  })
})
