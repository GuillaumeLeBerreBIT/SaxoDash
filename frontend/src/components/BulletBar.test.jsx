import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import BulletBar from './BulletBar'
import { BEAT, MISS } from '../lib/charts'

const measure = (container) => container.querySelectorAll('rect')[1]

describe('BulletBar', () => {
  it('renders nothing when it has neither an actual nor an estimate', () => {
    const { container } = render(<BulletBar actual={null} estimate={null} />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('paints the measure green when the actual beat the estimate', () => {
    const { container } = render(<BulletBar actual={2.2} estimate={2.0} />)
    expect(measure(container)).toHaveAttribute('fill', BEAT)
  })

  it('paints the measure red when the actual missed the estimate', () => {
    const { container } = render(<BulletBar actual={1.8} estimate={2.0} />)
    expect(measure(container)).toHaveAttribute('fill', MISS)
  })

  it('reads its numbers out for assistive tech', () => {
    const { container } = render(<BulletBar actual={2.2} estimate={2.0} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Actual 2.2, estimate 2')
  })

  it('shows only the target tick before a company has reported', () => {
    const { container } = render(<BulletBar actual={null} estimate={2.0} />)
    // track + tick, no measure bar
    expect(container.querySelectorAll('rect')).toHaveLength(2)
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Estimate 2, not yet reported')
  })
})
