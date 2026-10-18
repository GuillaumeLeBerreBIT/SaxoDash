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
    expect(container.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.queryByText('WB')).not.toBeInTheDocument()
  })

  it('falls back to initials when the photo fails to load', () => {
    const { container } = render(<InvestorAvatar name="Warren Buffett" photo="https://example.test/broken.jpg" />)
    fireEvent.error(container.querySelector('img'))
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('WB')).toBeInTheDocument()
  })

  it('shows the firm logo on a light disc when there is no photo', () => {
    const { container } = render(<InvestorAvatar name="Michael Burry" logo="https://example.test/scion.png" />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://example.test/scion.png')
    expect(img.className).toContain('bg-white')
    expect(img.style.padding).toBe('4px')
  })

  it('prefers the photo to the logo and falls back to the logo, then initials', () => {
    const { container } = render(<InvestorAvatar name="Warren Buffett" photo="https://example.test/p.jpg" logo="https://example.test/l.png" />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/p.jpg')
    fireEvent.error(container.querySelector('img'))
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/l.png')
    fireEvent.error(container.querySelector('img'))
    expect(screen.getByText('WB')).toBeInTheDocument()
  })
})
