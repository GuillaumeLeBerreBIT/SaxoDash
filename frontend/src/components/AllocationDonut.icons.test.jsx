import { cloneElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 500, height: 400 }),
  }
})

vi.mock('../lib/chartGeometry', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useWidth: () => [{ current: null }, 500] }
})

import AllocationDonut from './AllocationDonut'

const fmt = (v) => `$${v}`
const two = [
  { name: 'AAPL', value: 70, color: '#60a5fa' },
  { name: 'MSFT', value: 30, color: '#34d399' },
]
const three = [...two, { name: 'NVDA', value: 20, color: '#f59e0b' }]

describe('AllocationDonut with icons', () => {
  it('draws a logo per slice', () => {
    const { container } = render(<AllocationDonut items={two} formatValue={fmt} showIcons />)
    expect(container.querySelectorAll('image')).toHaveLength(2)
  })

  it('shows the first letter once a slice logo errors', () => {
    const { container } = render(<AllocationDonut items={two} formatValue={fmt} showIcons />)
    fireEvent.error(container.querySelector('image'))
    expect(container.querySelectorAll('image')).toHaveLength(1)
    expect(container.textContent).toContain('A')
  })

  it('survives the slice count changing', () => {
    const { rerender, container } = render(<AllocationDonut items={two} formatValue={fmt} showIcons />)
    rerender(<AllocationDonut items={three} formatValue={fmt} showIcons />)
    expect(container.querySelectorAll('image')).toHaveLength(3)
    rerender(<AllocationDonut items={two.slice(0, 1)} formatValue={fmt} showIcons />)
    expect(container.querySelectorAll('image')).toHaveLength(1)
  })
})
