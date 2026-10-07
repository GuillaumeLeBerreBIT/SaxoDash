import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileTopBar from './MobileTopBar'
import { renderWithProviders } from '../test/renderWithProviders'

vi.mock('../api/queries')
import * as queries from '../api/queries'

beforeEach(() => {
  queries.useSaxoStatus.mockReturnValue({ data: { connected: false } })
})

describe('MobileTopBar', () => {
  it('opens the palette from the search button', async () => {
    const onOpenPalette = vi.fn()
    renderWithProviders(<MobileTopBar onOpenPalette={onOpenPalette} />)
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onOpenPalette).toHaveBeenCalledTimes(1)
  })

  it('is hidden from the md breakpoint up', () => {
    const { container } = renderWithProviders(<MobileTopBar onOpenPalette={() => {}} />)
    expect(container.firstChild).toHaveClass('md:hidden')
  })

  it('shows the wordmark', () => {
    renderWithProviders(<MobileTopBar onOpenPalette={() => {}} />)
    expect(screen.getByText('SaxoDash')).toBeInTheDocument()
  })

  it('shows the compact Saxo status', () => {
    renderWithProviders(<MobileTopBar onOpenPalette={() => {}} />)
    expect(screen.getByRole('status', { name: 'Saxo not connected' })).toBeInTheDocument()
  })

  it('pads below the notch while keeping a 48px bar', () => {
    const { container } = renderWithProviders(<MobileTopBar onOpenPalette={() => {}} />)
    const header = container.firstChild
    expect(header).toHaveClass('md:hidden', 'sticky', 'top-0', 'pt-[env(safe-area-inset-top)]')
    expect(header).not.toHaveClass('h-12')
    expect(header.firstChild).toHaveClass('h-12')
  })
})
