import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import IndicatorChips from './IndicatorChips'

const controls = (overrides = {}) => ({
  overlays: { ma20: true, ma50: false },
  panes: { rsi: false },
  toggleOverlay: vi.fn(),
  togglePane: vi.fn(),
  ...overrides,
})

describe('IndicatorChips', () => {
  it('shows which quick indicators are on', () => {
    render(<IndicatorChips controls={controls()} />)

    expect(screen.getByRole('button', { name: 'MA 20' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'MA 50' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'RSI' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('toggles the moving averages as overlays and RSI as a lower pane', async () => {
    const c = controls()
    render(<IndicatorChips controls={c} />)

    await userEvent.click(screen.getByRole('button', { name: 'MA 50' }))
    await userEvent.click(screen.getByRole('button', { name: 'RSI' }))

    expect(c.toggleOverlay).toHaveBeenCalledWith('ma50')
    expect(c.togglePane).toHaveBeenCalledWith('rsi')
  })
})
