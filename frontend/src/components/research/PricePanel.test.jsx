import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  beforeEach(() => localStorage.clear())

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

  it('keeps the Volume and Previous close choices across a remount', async () => {
    const first = renderPanel()
    await userEvent.click(screen.getByLabelText('Volume'))
    await userEvent.click(screen.getByLabelText('Previous close'))
    first.unmount()

    renderPanel()
    expect(screen.getByLabelText('Volume')).toBeChecked()
    expect(screen.getByLabelText('Previous close')).not.toBeChecked()
  })

  it('keeps the tooltip after a finger lifts but drops it when a mouse leaves', () => {
    renderPanel()
    const chart = screen.getByRole('img', { name: 'NVDA price chart' })
    chart.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 300 })

    fireEvent.pointerMove(chart, { clientX: 0 })
    fireEvent.pointerLeave(chart, { pointerType: 'touch' })
    expect(screen.getByTestId('price-hover')).toBeInTheDocument()

    fireEvent.pointerLeave(chart, { pointerType: 'mouse' })
    expect(screen.queryByTestId('price-hover')).not.toBeInTheDocument()
  })

  it('writes the 52-week range with its currency', () => {
    const year = Array.from({ length: 260 }, (_, i) => ({ date: `2026-01-01`, open: 100, high: 120, low: 90, close: 100 + (i % 5), volume: 1 }))
    renderPanel({ allBars: year })

    expect(within(screen.getByTestId('price-facts')).getByText('52-week range').nextSibling).toHaveTextContent('US$90.00 – US$120.00')
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
