import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import QualityValuationQuadrant from './QualityValuationQuadrant'

describe('QualityValuationQuadrant', () => {
  it('renders nothing with fewer than two points', () => {
    const { container } = render(
      <QualityValuationQuadrant points={[{ symbol: 'AAPL', quality: 80, valuation: 60, isSelf: true }]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the chart card with two or more points', () => {
    render(
      <QualityValuationQuadrant
        points={[
          { symbol: 'AAPL', quality: 80, valuation: 60, isSelf: true },
          { symbol: 'MSFT', quality: 75, valuation: 55, isSelf: false },
        ]}
      />,
    )
    expect(screen.getByText('Quality vs. valuation')).toBeInTheDocument()
  })

  // Regression: a 100/100 point used to land exactly on the plot's top-right
  // corner (domain === axis extremes, no margin headroom), clipping its
  // symbol label against the SVG edge. jsdom can't measure text, so this
  // asserts the fix's actual mechanisms instead of pixel-perfect layout:
  // the axis titles moved outside the SVG (nothing left to collide with the
  // tick labels), and the padded domain leaves real headroom around an
  // edge-value dot.
  describe('boundary values at 100/100', () => {
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 480, height: 220, top: 0, left: 0, right: 480, bottom: 220, x: 0, y: 0, toJSON() {},
      })
    })
    afterEach(() => vi.restoreAllMocks())

    it('keeps the axis titles out of the SVG so they cannot collide with tick labels', () => {
      const { container } = render(
        <QualityValuationQuadrant
          points={[
            { symbol: 'SELF', quality: 50, valuation: 50, isSelf: true },
            { symbol: 'MAXBOTH', quality: 100, valuation: 100, isSelf: false },
          ]}
        />,
      )
      expect(container.querySelectorAll('.recharts-label')).toHaveLength(0)
      expect(screen.getByText('Quality →')).toBeInTheDocument()
      expect(screen.getByText('Pricier →')).toBeInTheDocument()
    })

    it('gives a max-score dot headroom instead of pinning it to the plot edge', () => {
      const { container } = render(
        <QualityValuationQuadrant
          points={[
            { symbol: 'SELF', quality: 50, valuation: 50, isSelf: true },
            { symbol: 'MAXBOTH', quality: 100, valuation: 100, isSelf: false },
          ]}
        />,
      )
      const dots = [...container.querySelectorAll('.recharts-scatter-symbol path')]
      const maxDot = dots.find((d) => Number(d.getAttribute('cx')) > 400)
      expect(maxDot).toBeTruthy()
      // Chart margin.top is 14px; a dot with zero headroom (the old bug)
      // renders with cy === marginTop. This one should sit well past it.
      expect(Number(maxDot.getAttribute('cy'))).toBeGreaterThan(14 + 8)
    })
  })
})
