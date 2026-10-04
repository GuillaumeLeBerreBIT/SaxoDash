import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import LensChips from './LensChips'

describe('LensChips', () => {
  it('labels a chip with its short name', () => {
    render(<LensChips shelves={[{ key: 'overbought', title: 'Overbought stocks', short: 'Overbought', total: 7 }]} />)
    expect(screen.getByRole('link', { name: /Overbought 7/ })).toHaveAttribute('href', '#shelf-overbought')
  })

  it('falls back to the title when a shelf has no short name', () => {
    render(<LensChips shelves={[{ key: 'oversold', title: 'Oversold stocks', total: 3 }]} />)
    expect(screen.getByRole('link', { name: /Oversold stocks 3/ })).toBeInTheDocument()
  })
})
