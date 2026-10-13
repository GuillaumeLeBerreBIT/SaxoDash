import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import EpsBarChart from './EpsBarChart'

const row = (period, estimate) => ({ period, actual: 1, estimate, surprise: null, forward: false })
const format = (value) => String(value)

describe('EpsBarChart', () => {
  it('has no estimate entry in the legend when no row has an estimate', () => {
    render(<EpsBarChart title="EPS" data={[row('FY 2024', null), row('FY 2025', null)]} format={format} />)

    expect(screen.getByText('EPS')).toBeInTheDocument()
    expect(screen.queryByText('Estimate')).not.toBeInTheDocument()
  })

  it('lists the estimate when some row has one', () => {
    render(<EpsBarChart title="EPS" data={[row('Q1', 0.9), row('Q2', null)]} format={format} />)

    expect(screen.getByText('Estimate')).toBeInTheDocument()
  })

  it('renders nothing without rows', () => {
    const { container } = render(<EpsBarChart title="EPS" data={[]} format={format} />)

    expect(container).toBeEmptyDOMElement()
  })
})
