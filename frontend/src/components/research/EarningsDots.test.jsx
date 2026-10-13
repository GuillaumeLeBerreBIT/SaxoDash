import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import EarningsDots from './EarningsDots'

const quarter = (date, actual, estimate) => ({
  date,
  eps_actual: actual,
  eps_estimate: estimate,
  eps_surprise_pct: estimate ? ((actual - estimate) / Math.abs(estimate)) * 100 : null,
})

const history = [
  quarter('2025-06-30', 0.7, 0.72),
  quarter('2025-09-30', 0.83, 0.79),
  quarter('2025-12-31', 0.88, 0.85),
  quarter('2026-03-31', 0.91, 0.96),
  quarter('2026-06-30', 0.99, 0.96),
]

const cy = (node) => Number(node.getAttribute('cy'))

describe('EarningsDots', () => {
  it('draws the last four reported quarters and the next one', () => {
    const { container } = render(<EarningsDots history={history} next={{ date: '2026-10-28', eps_estimate: 1.02 }} />)

    expect(container.querySelectorAll('[data-dot="actual"]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-dot="estimate"]')).toHaveLength(5)
    expect(screen.getByText("Q3 '25")).toBeInTheDocument()
    expect(screen.queryByText("Q2 '25")).not.toBeInTheDocument()
    expect(screen.getByText('Next')).toBeInTheDocument()
  })

  it('places a higher figure higher up', () => {
    const { container } = render(<EarningsDots history={history} next={null} />)
    const actuals = [...container.querySelectorAll('[data-dot="actual"]')]

    expect(cy(actuals[3])).toBeLessThan(cy(actuals[0]))
  })

  it('keeps every dot inside the plot when all figures are equal or negative', () => {
    const flat = [quarter('2026-03-31', -0.5, -0.5), quarter('2026-06-30', -0.5, -0.5)]
    const { container } = render(<EarningsDots history={flat} next={null} />)

    for (const dot of container.querySelectorAll('circle')) {
      expect(Number.isFinite(cy(dot))).toBe(true)
      expect(cy(dot)).toBeGreaterThanOrEqual(0)
      expect(cy(dot)).toBeLessThanOrEqual(72)
    }
  })

  it('renders nothing without a reported quarter or an upcoming estimate', () => {
    const { container } = render(<EarningsDots history={[]} next={{ date: '2026-10-28', eps_estimate: null }} />)
    expect(container.firstChild).toBeNull()
  })

  it('reads each figure to a screen reader', () => {
    render(<EarningsDots history={history} next={{ date: '2026-10-28', eps_estimate: 1.02 }} />)

    const name = screen.getByRole('img').getAttribute('aria-label')
    expect(name).toContain("Q2 '26 0.99 against 0.96")
    expect(name).toContain('Next estimate 1.02')
  })

  it('says what it shows to a screen reader', () => {
    render(<EarningsDots history={history} next={null} />)
    expect(screen.getByRole('img', { name: /EPS, actual against estimate/i })).toBeInTheDocument()
  })
})
