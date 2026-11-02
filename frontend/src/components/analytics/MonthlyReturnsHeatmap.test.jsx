import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { chartPalette, PERFORMANCE_CAPS, performanceFill } from '../../lib/charts'
import MonthlyReturnsHeatmap from './MonthlyReturnsHeatmap'

const toRgb = (rgba) => rgba.replace('rgba', 'rgb').replace(/, [\d.]+\)$/, ')')

describe('MonthlyReturnsHeatmap', () => {
  const months = [
    { year: 2026, month: 2, pct: 5.1 },
    { year: 2026, month: 3, pct: -4.2 },
  ]

  it('signs every month with a true minus for a loss', () => {
    render(<MonthlyReturnsHeatmap monthlyReturns={months} />)
    expect(screen.getByTitle('Feb 2026: +5.1%')).toHaveTextContent('+5.1')
    expect(screen.getByTitle('Mar 2026: -4.2%')).toHaveTextContent('−4.2')
  })

  it('tints a month from the active palette', () => {
    const c = chartPalette({ theme: 'republic', moves: 'green-red' })
    render(<MonthlyReturnsHeatmap monthlyReturns={months} />)
    const expected = performanceFill(-4.2, { cap: PERFORMANCE_CAPS.month, flat: 0 }, c)
    expect(toRgb(screen.getByTitle('Mar 2026: -4.2%').style.background)).toBe(toRgb(expected))
  })

  it('leaves a month without data blank rather than flat', () => {
    render(<MonthlyReturnsHeatmap monthlyReturns={months} />)
    const january = screen.getByText('2026').closest('tr').querySelectorAll('td')[1]
    expect(january).toHaveTextContent('')
    expect(january.style.background).toBe('transparent')
  })
})
