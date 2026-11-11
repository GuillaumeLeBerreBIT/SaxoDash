import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import ActionBadge from './ActionBadge'

describe('ActionBadge', () => {
  it('renders nothing while the verdict is unknown to the page', () => {
    const { container } = render(<ActionBadge verdict={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a dash for a ticker the scan does not cover', () => {
    render(<ActionBadge verdict={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders the action label with the reason as its title', () => {
    render(<ActionBadge verdict={{ action: 'sell_review', reason: 'Weak business.' }} />)
    expect(screen.getByText('Sell (review)')).toBeInTheDocument()
    expect(screen.getByTitle('Weak business.')).toBeInTheDocument()
  })

  it('falls back to the raw key for an action it has no label for', () => {
    render(<ActionBadge verdict={{ action: 'mystery', reason: 'x' }} />)
    expect(screen.getByText('mystery')).toBeInTheDocument()
  })
})
