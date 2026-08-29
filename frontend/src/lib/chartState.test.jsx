import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { chartPlaceholderFor } from './chartState'

const renderPlaceholder = (args) => {
  const node = chartPlaceholderFor(args)
  if (node === null) return null
  render(node)
  return node
}

describe('chartPlaceholderFor', () => {
  it('returns null when a line chart has enough points to draw', () => {
    expect(chartPlaceholderFor({ data: [{}, {}], minPoints: 2 })).toBeNull()
  })

  it('returns null when a bar chart has its single point', () => {
    expect(chartPlaceholderFor({ data: [{}], minPoints: 1 })).toBeNull()
  })

  it('reports loading before data arrives', () => {
    renderPlaceholder({ isLoading: true, data: undefined })
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('reports a failure instead of an empty plot', () => {
    renderPlaceholder({ error: new Error('boom'), data: undefined })
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
  })

  it('reports an empty dataset', () => {
    renderPlaceholder({ data: [] })
    expect(screen.getByText('No data yet')).toBeInTheDocument()
  })

  // The case that motivated all of this: after purging the demo snapshots the
  // net-worth series had exactly one point, and Recharts with dot={false} drew
  // nothing at all - a chart that looked broken but had loaded fine.
  it('explains a single-point series rather than drawing an invisible line', () => {
    renderPlaceholder({ data: [{ date: '2026-08-28' }], minPoints: 2 })
    expect(screen.getByText(/only one day of history/i)).toBeInTheDocument()
  })
})
