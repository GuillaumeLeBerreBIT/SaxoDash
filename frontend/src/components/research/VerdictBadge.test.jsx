import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import VerdictBadge from './VerdictBadge'

describe('VerdictBadge', () => {
  it('renders the tone dot and text', () => {
    render(<VerdictBadge tone="pos" text="Highly profitable" />)
    expect(screen.getByText('Highly profitable')).toBeInTheDocument()
  })

  it('renders nothing without text', () => {
    const { container } = render(<VerdictBadge tone="pos" text={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('maps each verdict tone onto a tag tone', () => {
    const { rerender } = render(<VerdictBadge tone="pos" text="Read" />)
    expect(screen.getByText('Read')).toHaveClass('text-up')

    rerender(<VerdictBadge tone="caution" text="Read" />)
    expect(screen.getByText('Read')).toHaveClass('text-warn-text')

    rerender(<VerdictBadge tone="neutral" text="Read" />)
    expect(screen.getByText('Read')).toHaveClass('text-ink-2')
  })
})
