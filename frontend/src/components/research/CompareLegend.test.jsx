import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import CompareLegend from './CompareLegend'

const amd = { symbol: 'AMD', uic: 7, assetType: 'Stock' }
const lines = [
  { key: 'main', label: 'NVDA', color: 'white', values: [0, 10, 20], status: 'ok' },
  { key: 'sp500', label: 'S&P 500', color: 'grey', values: [0, null, 5], status: 'ok' },
  { key: 'added:7', label: 'AMD', color: 'purple', values: [null, 0, 4], from: '2026-07-21', status: 'ok', removable: true, instrument: amd },
  { key: 'sector', label: 'XLK', color: 'orange', values: [], status: 'error' },
]

const renderLegend = (props = {}) => {
  const handlers = { onToggle: vi.fn(), onRemove: vi.fn() }
  render(<CompareLegend lines={lines} date="2026-07-22" hover={null} hidden={new Set()} {...handlers} {...props} />)
  return handlers
}

describe('CompareLegend', () => {
  it('reads the last visible day when nothing is hovered', () => {
    renderLegend()
    expect(screen.getByText('+20.0%')).toBeInTheDocument()
    expect(screen.getByText('+5.0%')).toBeInTheDocument()
    expect(screen.getByText('from 21 Jul')).toBeInTheDocument()
  })

  it('shows a dash on a hovered day a line did not trade', () => {
    renderLegend({ hover: 1 })
    expect(screen.getByText('+10.0%')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('says a line could not load without hiding the others', () => {
    renderLegend()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.getByText('+20.0%')).toBeInTheDocument()
  })

  it('hides a compared line but never the stock itself', async () => {
    const user = userEvent.setup()
    const { onToggle } = renderLegend()
    expect(screen.queryByRole('button', { name: 'Hide NVDA' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Hide S&P 500' }))
    expect(onToggle).toHaveBeenCalledWith('sp500')
  })

  it('removes only an added symbol', async () => {
    const user = userEvent.setup()
    const { onRemove } = renderLegend()
    expect(screen.queryByRole('button', { name: 'Remove S&P 500' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Remove AMD' }))
    expect(onRemove).toHaveBeenCalledWith(amd)
  })
})
