import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { StatStrip, StatRow, Skeleton, Metric } from './ui'

describe('ui primitives', () => {
  it('StatStrip renders its StatRow children with label, value, badge and note', () => {
    render(
      <StatStrip>
        <StatRow label="Net worth" value="€1,000" badge="+2.1%" badgeTone="emerald" note="all-time" />
      </StatStrip>,
    )
    expect(screen.getByText('Net worth')).toBeInTheDocument()
    expect(screen.getByText('€1,000')).toBeInTheDocument()
    expect(screen.getByText('+2.1%')).toBeInTheDocument()
    expect(screen.getByText('all-time')).toBeInTheDocument()
  })

  it('Skeleton renders a block', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />)
    expect(container.firstChild).toHaveClass('animate-pulse')
  })

  it('Metric shows a label, a value and an optional hint', () => {
    render(<Metric label="P/E" value="32.10" hint="hint text" />)
    expect(screen.getByText('P/E')).toBeInTheDocument()
    expect(screen.getByText('32.10')).toBeInTheDocument()
    expect(screen.getByText('hint text')).toBeInTheDocument()
  })
})
