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
    expect(element.title).toMatch(/^Today's P\/E against the middle half/)
  })

  it.each([['below', 'bg-up'], ['above', 'bg-warn'], ['inside', 'bg-ink-3']])('colours the dot for %s', (position, cls) => {
    render(<PeChip chip={chip(position)} />)
    expect(screen.getByTestId('pe-chip-dot')).toHaveClass(cls)
  })

  it('renders nothing without a chip', () => {
    const { container } = render(<PeChip chip={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
