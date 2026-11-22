import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import PerformanceRows from './PerformanceRows'

describe('PerformanceRows', () => {
  it('shows each period with its move, and a dash for a period with no figure', () => {
    render(<PerformanceRows returns={[{ key: '1M', pct: -1.27 }, { key: '1Y', pct: 11.39 }, { key: 'YTD', pct: null }]} />)

    expect(screen.getByText('1M')).toBeInTheDocument()
    expect(screen.getByText('1Y')).toBeInTheDocument()
    expect(screen.getByText('YTD').nextSibling).toHaveTextContent('—')
    expect(screen.queryByTestId('bar-YTD')).not.toBeInTheDocument()
  })

  it('scales the bars to the biggest move, red below zero and green above', () => {
    render(<PerformanceRows returns={[{ key: '1M', pct: -5 }, { key: '1Y', pct: 10 }]} />)

    expect(screen.getByTestId('bar-1Y')).toHaveStyle({ width: '100%' })
    expect(screen.getByTestId('bar-1M')).toHaveStyle({ width: '50%' })
    expect(screen.getByTestId('bar-1M')).toHaveClass('bg-down')
    expect(screen.getByTestId('bar-1Y')).toHaveClass('bg-up')
  })

  it('draws nothing when no period has a figure', () => {
    const { container } = render(<PerformanceRows returns={[{ key: '1M', pct: null }]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
