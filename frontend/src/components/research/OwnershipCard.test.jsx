import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import OwnershipCard from './OwnershipCard'

describe('OwnershipCard', () => {
  it('splits the shares into free float and closely held', () => {
    render(<OwnershipCard fundamentals={{ shares_outstanding: 1000, free_float: 800 }} />)

    expect(screen.getByText('Free float').parentElement).toHaveTextContent('80.0%')
    expect(screen.getByText('Closely held').parentElement).toHaveTextContent('20.0%')
    expect(screen.getByRole('img', { name: 'Free float 80.0%, closely held 20.0%' })).toBeInTheDocument()
  })

  it('caps a float reported above the share count', () => {
    render(<OwnershipCard fundamentals={{ shares_outstanding: 1000, free_float: 1100 }} />)

    expect(screen.getByText('Free float').parentElement).toHaveTextContent('100.0%')
    expect(screen.getByText('Closely held').parentElement).toHaveTextContent('0.0%')
  })

  it('renders nothing without both figures', () => {
    const { container, rerender } = render(<OwnershipCard fundamentals={{ shares_outstanding: 1000, free_float: null }} />)
    expect(container).toBeEmptyDOMElement()

    rerender(<OwnershipCard fundamentals={{ shares_outstanding: 0, free_float: 10 }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
