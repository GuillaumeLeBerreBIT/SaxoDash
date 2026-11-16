import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import CalendarYears from './CalendarYears'

describe('CalendarYears', () => {
  it('shows an empty state instead of an empty chart when there are no years', () => {
    render(<CalendarYears years={[]} benchmarkName="World" />)

    expect(screen.getByText('No full calendar year yet')).toBeInTheDocument()
  })

  it('flags a year to date in the subtitle', () => {
    render(<CalendarYears years={[{ year: 2026, portfolio_pct: 3, benchmark_pct: 2, partial: true }]} benchmarkName="World" />)

    expect(screen.getByText(/\* year to date/)).toBeInTheDocument()
  })

  it('leaves out a year the portfolio did not exist in, even when the index has a figure', () => {
    render(<CalendarYears years={[{ year: 2024, portfolio_pct: null, benchmark_pct: 18.2, partial: false }]} benchmarkName="World" />)
    expect(screen.getByText('No full calendar year yet')).toBeInTheDocument()
  })
})
