import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import InvestorAvatar from './InvestorAvatar'

describe('InvestorAvatar', () => {
  it('shows initials when there is no photo', () => {
    render(<InvestorAvatar name="Michael Burry" />)
    expect(screen.getByText('MB')).toBeInTheDocument()
  })

  it('shows the photo when there is one', () => {
    const { container } = render(<InvestorAvatar name="Warren Buffett" photo="https://example.test/buffett.jpg" />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/buffett.jpg')
    expect(screen.queryByText('WB')).not.toBeInTheDocument()
  })

  it('falls back to initials when the photo fails to load', () => {
    const { container } = render(<InvestorAvatar name="Warren Buffett" photo="https://example.test/broken.jpg" />)
    fireEvent.error(container.querySelector('img'))
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('WB')).toBeInTheDocument()
  })
})
