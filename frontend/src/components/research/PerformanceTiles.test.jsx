import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import PerformanceTiles from './PerformanceTiles'

const returns = [
  { key: '1W', pct: 4.2 },
  { key: '1M', pct: 7.97 },
  { key: '3M', pct: 35.83 },
  { key: '6M', pct: 56.22 },
  { key: 'YTD', pct: -7.95 },
  { key: '1Y', pct: null },
]

describe('PerformanceTiles', () => {
  it('prints each window with its sign', () => {
    render(<PerformanceTiles returns={returns} />)

    expect(screen.getByText('+4.20%')).toBeInTheDocument()
    expect(screen.getByText('-7.95%')).toBeInTheDocument()
    expect(screen.getByText('YTD')).toBeInTheDocument()
  })

  it('prints the figure in neutral text on the tinted tile', () => {
    render(<PerformanceTiles returns={returns} />)

    const figure = screen.getByText('+56.22%')
    expect(figure).toHaveClass('text-zinc-100')
    expect(figure).not.toHaveClass('text-emerald-400')
  })

  it('shows a dash for a window the history does not reach', () => {
    render(<PerformanceTiles returns={returns} />)

    const tile = screen.getByText('1Y').closest('li')
    expect(tile).toHaveTextContent('—')
  })

  it('renders nothing when no window has a figure', () => {
    const { container } = render(<PerformanceTiles returns={returns.map((row) => ({ ...row, pct: null }))} />)
    expect(container.firstChild).toBeNull()
  })
})
