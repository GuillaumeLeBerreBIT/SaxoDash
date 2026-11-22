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
})
