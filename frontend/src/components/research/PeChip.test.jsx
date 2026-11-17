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

  it.each([['below', 'bg-up'], ['above', 'bg-warn'], ['inside', 'bg-ink-3']])('colours the dot for %s', (position, cls) => {
    render(<PeChip chip={chip(position)} />)
    expect(screen.getByTestId('pe-chip-dot')).toHaveClass(cls)
  })

  it('words the inside and above readings', () => {
    const { rerender } = render(<PeChip chip={chip('inside')} />)
    expect(screen.getByTestId('pe-chip')).toHaveTextContent('inside its usual 45–77')
    rerender(<PeChip chip={chip('above')} />)
    expect(screen.getByTestId('pe-chip')).toHaveTextContent('above its usual 45–77')
  })

  it('renders nothing without a chip', () => {
    const { container } = render(<PeChip chip={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
