import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import AllocationDonut from './AllocationDonut'

const items = [
  { name: 'AAPL', note: 'APPLE INC', value: 70, color: '#60a5fa' },
  { name: 'Other', value: 30, color: '#52525b' },
]

describe('AllocationDonut', () => {
  it('shows a legend note next to the name', () => {
    render(<AllocationDonut items={items} formatValue={(v) => `$${v}`} />)
    expect(screen.getByText('APPLE INC')).toBeInTheDocument()
  })

  it('renders a centre read-out when asked, defaulting to the whole', () => {
    render(
      <AllocationDonut
        items={items}
        formatValue={(v) => `$${v}`}
        center={(active) => (active ? { label: active.name, value: `$${active.value}` } : { label: 'Total value', value: '$100', hint: '2 slices' })}
      />,
    )
    expect(screen.getByText('Total value')).toBeInTheDocument()
    expect(screen.getByText('2 slices')).toBeInTheDocument()
  })

  it('has no centre read-out by default', () => {
    render(<AllocationDonut items={items} formatValue={(v) => `$${v}`} />)
    expect(screen.queryByTestId('donut-center')).toBeNull()
  })

  it('keeps plain truncation for a legend name without a note', () => {
    const name = 'Saxo Bank - Trading account with a very long name'
    render(<AllocationDonut items={[{ name, value: 100, color: '#60a5fa' }]} formatValue={(v) => `$${v}`} />)
    const label = screen.getByText(name)
    expect(label).toHaveClass('truncate')
    expect(label).not.toHaveClass('shrink-0')
  })

  it('pins the legend name when a note follows it', () => {
    render(<AllocationDonut items={items} formatValue={(v) => `$${v}`} />)
    expect(screen.getByText('AAPL')).toHaveClass('shrink-0')
  })
})
