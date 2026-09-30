import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../../test/renderWithProviders'
import { DEFAULT_CHART_PREFS } from '../../lib/chartPrefs'
import ChartToolRail from './ChartToolRail'

const makeControls = (overrides = {}) => ({
  ...DEFAULT_CHART_PREFS,
  yScale: 1,
  setRange: vi.fn(),
  setType: vi.fn(),
  setYScale: vi.fn(),
  toggleOverlay: vi.fn(),
  togglePane: vi.fn(),
  ...overrides,
})

const renderRail = (props = {}) => {
  const all = {
    controls: makeControls(),
    placingLine: false,
    onPlacingLineChange: vi.fn(),
    canPlaceLine: true,
    backHref: '/research?symbol=NOW&uic=204300&assetType=Stock',
    ...props,
  }
  renderWithProviders(<ChartToolRail {...all} />)
  return all
}

describe('ChartToolRail', () => {
  it('shows the crosshair as the active tool by default', () => {
    renderRail()
    expect(screen.getByRole('button', { name: 'Crosshair' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('arms the line tool', async () => {
    const { onPlacingLineChange } = renderRail()
    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    expect(onPlacingLineChange).toHaveBeenCalledWith(true)
  })

  it('disarms the line tool from the line button or the crosshair', async () => {
    const { onPlacingLineChange } = renderRail({ placingLine: true })
    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Horizontal line' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crosshair' }))

    expect(onPlacingLineChange).toHaveBeenNthCalledWith(1, false)
    expect(onPlacingLineChange).toHaveBeenNthCalledWith(2, false)
  })

  it('disables the line tool when lines cannot be created', () => {
    renderRail({ canPlaceLine: false })
    expect(screen.getByRole('button', { name: 'Horizontal line' })).toBeDisabled()
  })

  it('disables reset while the price scale is already automatic', () => {
    renderRail()
    expect(screen.getByRole('button', { name: 'Reset price scale' })).toBeDisabled()
  })

  it('resets a stretched price scale', async () => {
    const controls = makeControls({ yScale: 2.4 })
    renderRail({ controls })
    await userEvent.click(screen.getByRole('button', { name: 'Reset price scale' }))
    expect(controls.setYScale).toHaveBeenCalledWith(1)
  })

  it('changes the chart type from its menu', async () => {
    const { controls } = renderRail()
    await userEvent.click(screen.getByRole('button', { name: 'Chart type' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Line' }))
    expect(controls.setType).toHaveBeenCalledWith('line')
  })

  it('toggles overlays and lower panes from the indicators menu', async () => {
    const { controls } = renderRail()
    await userEvent.click(screen.getByRole('button', { name: 'Indicators' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Bollinger/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /MACD/ }))
    expect(controls.toggleOverlay).toHaveBeenCalledWith('bb')
    expect(controls.togglePane).toHaveBeenCalledWith('macd')
  })

  it('links back to Research for the same exact instrument', () => {
    renderRail()
    expect(screen.getByRole('link', { name: 'Back to Research' })).toHaveAttribute(
      'href',
      '/research?symbol=NOW&uic=204300&assetType=Stock',
    )
  })

  it('sets Back to Research apart with its own divider', () => {
    renderRail()
    const separators = screen.getAllByRole('separator')
    expect(separators).toHaveLength(2)
    expect(separators[1].nextElementSibling).toBe(screen.getByRole('link', { name: 'Back to Research' }))
  })

  it('offers the chart layouts and reports the one picked', async () => {
    const user = userEvent.setup()
    const props = renderRail({ layout: '1', onLayoutChange: vi.fn() })

    await user.click(screen.getByRole('button', { name: 'Layout' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Single chart',
      'Side by side',
      'Stacked',
      'One large, two small',
      'Grid of four',
    ])

    await user.click(screen.getByRole('menuitem', { name: 'Grid of four' }))
    expect(props.onLayoutChange).toHaveBeenCalledWith('4')
  })

  it('keeps each layout icon on the same line as its label', async () => {
    const user = userEvent.setup()
    renderRail()

    await user.click(screen.getByRole('button', { name: 'Layout' }))
    const icon = screen.getAllByRole('menuitem')[0].querySelector('[aria-hidden="true"]')

    expect(icon).toHaveClass('inline-grid')
    expect(icon).not.toHaveClass('grid')
  })

  it('hides the layout menu below the lg breakpoint, where the rail itself is hidden', () => {
    renderRail()
    const wrapper = screen.getByRole('button', { name: 'Layout' }).closest('.hidden')
    expect(wrapper).toHaveClass('hidden', 'lg:flex')
  })
})
