import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import RatingGauge from './RatingGauge'

const needleX = (container) => Number(container.querySelector('line').getAttribute('x2'))

describe('RatingGauge', () => {
  it('names itself and prints its label', () => {
    render(<RatingGauge title="Analyst rating" fraction={0.79} label="Buy" />)

    expect(screen.getByRole('img', { name: 'Analyst rating: Buy' })).toBeInTheDocument()
    expect(screen.getByText('Buy')).toBeInTheDocument()
  })

  it('points right for a high fraction and left for a low one', () => {
    const high = render(<RatingGauge title="t" fraction={0.9} label="Strong buy" />)
    const low = render(<RatingGauge title="t" fraction={0.1} label="Strong sell" />)

    expect(needleX(high.container)).toBeGreaterThan(100)
    expect(needleX(low.container)).toBeLessThan(100)
  })

  it('clamps a fraction outside 0 to 1', () => {
    const over = render(<RatingGauge title="t" fraction={1.4} label="x" />)
    const full = render(<RatingGauge title="t" fraction={1} label="x" />)

    expect(needleX(over.container)).toBe(needleX(full.container))
  })

  it('colours the label by the segment the needle is in', () => {
    const buy = render(<RatingGauge title="t" fraction={0.65} label="Buy" />)
    const sell = render(<RatingGauge title="t" fraction={0.3} label="Sell" />)
    const hold = render(<RatingGauge title="t" fraction={0.4} label="Hold" />)

    expect(buy.getByText('Buy')).toHaveClass('text-emerald-400')
    expect(sell.getByText('Sell')).toHaveClass('text-red-400')
    expect(hold.getByText('Hold')).not.toHaveClass('text-emerald-400')
    expect(hold.getByText('Hold')).not.toHaveClass('text-red-400')
  })

  it('draws five segments', () => {
    const { container } = render(<RatingGauge title="t" fraction={0.5} label="Hold" />)
    expect(container.querySelectorAll('path')).toHaveLength(5)
  })
})
