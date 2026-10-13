import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import RatioHistoryChart from './RatioHistoryChart'

const history = [
  { period: '2024-09-28', pe: 37.2, roe: 160 },
  { period: '2025-09-27', pe: 33.56, roe: 151.91 },
]

describe('RatioHistoryChart', () => {
  it('offers the ratios that have a history and opens on the first', () => {
    render(<RatioHistoryChart history={history} />)

    const picker = screen.getByLabelText('Ratio')
    expect([...picker.options].map((option) => option.textContent)).toEqual(['P/E', 'ROE'])
    expect(screen.getByRole('img', { name: 'P/E by fiscal year' })).toBeInTheDocument()
  })

  it('switches the charted ratio', async () => {
    render(<RatioHistoryChart history={history} />)

    await userEvent.selectOptions(screen.getByLabelText('Ratio'), 'roe')

    expect(screen.getByRole('img', { name: 'ROE by fiscal year' })).toBeInTheDocument()
  })

  it('forgets a ratio the company lacks instead of restoring it for the next one', async () => {
    const { rerender } = render(<RatioHistoryChart history={history} />)
    await userEvent.selectOptions(screen.getByLabelText('Ratio'), 'roe')

    const peOnly = history.map(({ period, pe }) => ({ period, pe }))
    rerender(<RatioHistoryChart history={peOnly} />)
    expect(screen.getByRole('img', { name: 'P/E by fiscal year' })).toBeInTheDocument()

    rerender(<RatioHistoryChart history={history} />)
    expect(screen.getByRole('img', { name: 'P/E by fiscal year' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ratio').value).toBe('pe')
  })

  it('renders nothing with fewer than two points', () => {
    const { container } = render(<RatioHistoryChart history={[{ period: '2025-09-27', pe: 33 }]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
