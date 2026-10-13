import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import SeasonalsChart from './SeasonalsChart'

const series = [
  { year: 2024, points: [{ day: 2, pct: 0 }, { day: 180, pct: 20 }, { day: 364, pct: 54 }] },
  { year: 2025, points: [{ day: 2, pct: 0 }, { day: 180, pct: -10 }, { day: 364, pct: -27 }] },
  { year: 2026, points: [{ day: 2, pct: 0 }, { day: 180, pct: -12 }, { day: 282, pct: -4.84 }] },
]

describe('SeasonalsChart', () => {
  it('draws one line per year and lists the years with their return', () => {
    const { container } = render(<SeasonalsChart series={series} />)

    expect(container.querySelectorAll('polyline')).toHaveLength(3)
    expect(screen.getByText('2024')).toBeInTheDocument()
    expect(screen.getByText('+54.00%')).toBeInTheDocument()
    expect(screen.getByText('-4.84%')).toBeInTheDocument()
  })

  it('draws the latest year thicker than the others', () => {
    const { container } = render(<SeasonalsChart series={series} />)
    const widths = [...container.querySelectorAll('polyline')].map((line) => Number(line.getAttribute('stroke-width')))

    expect(widths[2]).toBeGreaterThan(widths[0])
  })

  it('keeps a single flat year drawable', () => {
    const { container } = render(<SeasonalsChart series={[{ year: 2026, points: [{ day: 2, pct: 0 }, { day: 9, pct: 0 }] }]} />)
    const points = container.querySelector('polyline').getAttribute('points')

    expect(points).not.toMatch(/NaN|Infinity/)
  })

  it('renders nothing without a full year', () => {
    const { container } = render(<SeasonalsChart series={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
