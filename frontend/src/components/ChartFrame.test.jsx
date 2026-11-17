import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import ChartFrame from './ChartFrame'

describe('ChartFrame', () => {
  it('names a drawn chart as one image', () => {
    render(
      <ChartFrame className="h-[var(--chart-h-md)]" label="Revenue by year">
        <svg />
      </ChartFrame>,
    )
    expect(screen.getByRole('img', { name: 'Revenue by year' })).toHaveClass('h-[var(--chart-h-md)]')
  })

  it('shows the placeholder instead of the chart and keeps its controls reachable', () => {
    render(
      <ChartFrame className="h-[var(--chart-h-md)]" label="Revenue by year" placeholder={<button type="button">Retry</button>}>
        <svg />
      </ChartFrame>,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
