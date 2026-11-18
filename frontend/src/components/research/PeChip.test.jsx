import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import PeChip from './PeChip'

const chip = (position) => ({ pe: 19.8, low: 45, high: 77, position })

describe('PeChip', () => {
  it('says the P/E and where it sits against its usual range', () => {
    render(<PeChip chip={chip('below')} />)
    const element = screen.getByTestId('pe-chip')
    expect(element).toHaveTextContent('P/E 19.8')
    expect(element).toHaveTextContent('below its usual 45–77')
    expect(element.title).toBe("Today's P/E against the middle half of its own weekly P/E over about the last five years")
  })

  it.each(['below', 'above', 'inside'])('keeps the dot neutral when the P/E is %s its range', (position) => {
    render(<PeChip chip={chip(position)} />)
    expect(screen.getByTestId('pe-chip-dot')).toHaveClass('bg-ink-3')
  })

  it('words the inside and above readings', () => {
    const { rerender } = render(<PeChip chip={chip('inside')} />)
    expect(screen.getByTestId('pe-chip')).toHaveTextContent('inside its usual 45–77')
    rerender(<PeChip chip={chip('above')} />)
    expect(screen.getByTestId('pe-chip')).toHaveTextContent('above its usual 45–77')
  })

  it('shows the P/E with one decimal and the usual range in whole numbers', () => {
    render(<PeChip chip={{ pe: 22.86, low: 42.5, high: 69.46, position: 'below' }} />)
    const element = screen.getByTestId('pe-chip')
    expect(element).toHaveTextContent('P/E 22.9')
    expect(element).toHaveTextContent('below its usual 43–69')
  })

  it('renders nothing without a chip', () => {
    const { container } = render(<PeChip chip={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
