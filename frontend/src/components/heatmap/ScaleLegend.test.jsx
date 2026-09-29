import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import ScaleLegend from './ScaleLegend'

describe('ScaleLegend', () => {
  it('labels both ends of the scale with the cap', () => {
    render(<ScaleLegend cap={3} />)
    expect(screen.getByText('−3%')).toBeInTheDocument()
    expect(screen.getByText('+3%')).toBeInTheDocument()
  })
})
