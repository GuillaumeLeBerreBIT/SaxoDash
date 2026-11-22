import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../../test/renderWithProviders'
import PricePanel from './PricePanel'

const bars = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-10-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 102 + i,
  low: 98 + i,
  close: 100 + i,
  volume: 1000 + i,
}))

function renderPanel(props = {}) {
  return renderWithProviders(
    <PricePanel
      bars={bars}
      allBars={bars}
      controls={{ range: '1M', setRange: vi.fn(), timeView: {} }}
      isLoading={false}
      error={null}
      symbol="NVDA"
      unresolved={false}
      currency="USD"
      pe={52.4}
      nextEarnings={{ date: '2026-11-29' }}
      viewSwitch={{ value: 'price', onChange: vi.fn() }}
      {...props}
    />,
  )
}

describe('PricePanel', () => {
  it('draws the previous close as the close before the latest bar, and drops it when unticked', async () => {
    renderPanel()

    const line = screen.getByTestId('previous-close-line')
    expect(within(line).getByText('128.00')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Previous close'))
    expect(screen.queryByTestId('previous-close-line')).not.toBeInTheDocument()
  })

  it('shows the date and close of the bar under the pointer', () => {
    renderPanel()

    const chart = screen.getByRole('img', { name: 'NVDA price chart' })
    chart.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 300 })
    fireEvent.pointerMove(chart, { clientX: 0 })

    const card = screen.getByTestId('price-hover')
    expect(card).toHaveTextContent('01 Oct 2026')
    expect(card).toHaveTextContent('US$100.00')
  })

  it('lists the P/E, the 52-week range once a year of bars is loaded, and the next earnings date', () => {
    renderPanel()

    const facts = screen.getByTestId('price-facts')
    expect(facts).toHaveTextContent('52.40')
    expect(facts).toHaveTextContent('29 Nov 2026')
    expect(within(facts).getByText('52-week range').nextSibling).toHaveTextContent('—')
  })

  it('shows a dash for a fact it does not have', () => {
    renderPanel({ pe: null, nextEarnings: null })

    const facts = screen.getByTestId('price-facts')
    expect(within(facts).getByText('P/E').nextSibling).toHaveTextContent('—')
    expect(within(facts).getByText('Next earnings').nextSibling).toHaveTextContent('—')
  })

  it('shows the loading state instead of a chart', () => {
    renderPanel({ isLoading: true, bars: [] })

    expect(screen.queryByRole('img', { name: 'NVDA price chart' })).not.toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
})
