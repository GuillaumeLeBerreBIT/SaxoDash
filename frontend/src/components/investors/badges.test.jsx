import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import ChangeBadge from './ChangeBadge'
import LimitsNote from './LimitsNote'
import WeightBar from './WeightBar'
import { OptionBadge, YouBadge } from './HoldingBadges'

describe('ChangeBadge', () => {
  it('names a new position in the accent tone', () => {
    render(<ChangeBadge change="new" />)
    expect(screen.getByText('New')).toHaveClass('text-held')
  })

  it('describes added and trimmed with an arrow and whole percent, neutrally', () => {
    const { rerender } = render(<ChangeBadge change="added" pct={10.4} />)
    expect(screen.getByText('▲ Added 10%')).toHaveClass('text-ink-2')
    rerender(<ChangeBadge change="trimmed" pct={-4.6} />)
    expect(screen.getByText('▼ Trimmed 5%')).toHaveClass('text-ink-2')
  })

  it('ChangeBadge caps absurd percentages', () => {
    const { rerender } = render(<ChangeBadge change="added" pct={76194} />)
    expect(screen.getByText('▲ Added >10×')).toBeInTheDocument()
    rerender(<ChangeBadge change="added" pct={1000} />)
    expect(screen.getByText('▲ Added >10×')).toBeInTheDocument()
    rerender(<ChangeBadge change="added" pct={999.4} />)
    expect(screen.getByText('▲ Added 999%')).toBeInTheDocument()
  })

  it('keeps the arrow beside its word when a narrow tile wraps the badge', () => {
    const { rerender } = render(<ChangeBadge change="added" pct={10.4} />)
    expect(screen.getByText('▲ Added 10%').textContent).toBe('▲\u00a0Added 10%')
    rerender(<ChangeBadge change="trimmed" pct={-4.6} />)
    expect(screen.getByText('▼ Trimmed 5%').textContent).toBe('▼\u00a0Trimmed 5%')
  })

  it('marks a sold-out position in amber', () => {
    render(<ChangeBadge change="sold_out" />)
    expect(screen.getByText('Sold out')).toHaveClass('text-warn')
  })

  it('says unchanged quietly and nothing for a first quarter', () => {
    const { container, rerender } = render(<ChangeBadge change="unchanged" />)
    expect(screen.getByText('Unchanged')).toBeInTheDocument()
    rerender(<ChangeBadge change={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('holding badges', () => {
  it('labels options and your own positions', () => {
    render(<><OptionBadge putCall="PUT" /><YouBadge owned watched={false} /><YouBadge owned={false} watched /></>)
    expect(screen.getByText('Put')).toBeInTheDocument()
    expect(screen.getByText('You own')).toBeInTheDocument()
    expect(screen.getByText('Watchlist')).toBeInTheDocument()
  })

  it('renders nothing for a plain stock you do not follow', () => {
    const { container } = render(<><OptionBadge putCall="" /><YouBadge owned={false} watched={false} /></>)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('WeightBar', () => {
  it('scales the fill to the largest weight', () => {
    const { container } = render(<WeightBar weight={11} max={22} />)
    expect(container.querySelector('[data-fill]')).toHaveStyle({ width: '50%' })
  })
})

describe('LimitsNote', () => {
  it('states what 13F cannot show', () => {
    render(<LimitsNote />)
    expect(screen.getByText(/US-listed long positions and listed options at quarter end only/)).toBeInTheDocument()
  })
})
