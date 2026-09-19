import { describe, expect, it, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import PeriodSelector from './PeriodSelector'

describe('PeriodSelector', () => {
  it('calls onChange with the resolved period when a preset is picked', () => {
    const onChange = vi.fn()
    renderWithProviders(
      <PeriodSelector
        value={{ key: 'this_month', date_from: '2026-09-01', date_to: '2026-09-19', label: 'September 2026' }}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Select period' }), { target: { value: 'last_month' } })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ key: 'last_month' }))
  })

  it('shows two date inputs when Custom range is selected', () => {
    const onChange = vi.fn()
    const { container } = renderWithProviders(
      <PeriodSelector
        value={{ key: 'custom', date_from: '2026-09-01', date_to: '2026-09-19', label: 'Custom range' }}
        onChange={onChange}
      />,
    )

    expect(container.querySelectorAll('input[type="date"]').length).toBe(2)
  })

  it('does not show date inputs for a preset', () => {
    const onChange = vi.fn()
    const { container } = renderWithProviders(
      <PeriodSelector
        value={{ key: 'this_month', date_from: '2026-09-01', date_to: '2026-09-19', label: 'September 2026' }}
        onChange={onChange}
      />,
    )

    expect(container.querySelectorAll('input[type="date"]').length).toBe(0)
  })

  it('does not propagate an incomplete range when a custom date is cleared', () => {
    const onChange = vi.fn()
    renderWithProviders(
      <PeriodSelector
        value={{ key: 'custom', date_from: '2026-09-01', date_to: '2026-09-19', label: 'Custom range' }}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '' } })

    expect(onChange).not.toHaveBeenCalled()
  })
})
