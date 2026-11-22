import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import ChartLink from './ChartLink'

describe('ChartLink', () => {
  it('links to Charts for the symbol and pins the instrument when given', () => {
    render(
      <MemoryRouter>
        <ChartLink symbol="NOW" instrument={{ uic: 42, assetType: 'Stock' }} />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Open NOW chart' })
    expect(link.getAttribute('href')).toMatch(/^\/charts\?symbol=NOW/)
    expect(link.getAttribute('href')).toContain('42')
  })

  it('draws a bigger button when asked for the large size', () => {
    render(
      <MemoryRouter>
        <ChartLink symbol="NOW" size="lg" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Open NOW chart' }).className).toContain('sm:w-8')
  })
})
