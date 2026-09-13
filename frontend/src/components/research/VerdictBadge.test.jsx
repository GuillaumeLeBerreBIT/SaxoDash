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
})
