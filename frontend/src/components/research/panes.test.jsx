import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

import { VolumePane } from './panes'

const data = [
  { date: '2026-09-01', open: 1, high: 2, low: 1, close: 2, volume: 100 },
  { date: '2026-09-02', open: 2, high: 2, low: 1, close: 1, volume: 300 },
]

describe('VolumePane', () => {
  it('brightens a bar traded on elevated volume', () => {
    const { container } = render(<VolumePane data={data} rvol={[null, 2.5]} hover={null} setHover={vi.fn()} />)
    const opacities = [...container.querySelectorAll('rect')].map((rect) => rect.getAttribute('opacity'))
    expect(opacities).toEqual(['0.4', '0.8'])
  })

  it('draws every bar plainly without a relative-volume series', () => {
    const { container } = render(<VolumePane data={data} hover={null} setHover={vi.fn()} />)
    const opacities = [...container.querySelectorAll('rect')].map((rect) => rect.getAttribute('opacity'))
    expect(opacities).toEqual(['0.4', '0.4'])
  })
})
