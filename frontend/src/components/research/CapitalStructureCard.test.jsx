import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import CapitalStructureCard from './CapitalStructureCard'

const value = (label) => screen.getByText(label).parentElement.querySelector('dd').textContent

describe('CapitalStructureCard', () => {
  it('reads net debt as enterprise value minus market cap', () => {
    render(<CapitalStructureCard fundamentals={{ market_cap: 4_000_000, enterprise_value: 4_050_000 }} />)

    expect(value('Market cap')).toBe('4.00T')
    expect(value('Net debt')).toBe('50.00B')
    expect(value('Enterprise value')).toBe('4.05T')
  })

  it('calls it net cash when the company holds more cash than debt', () => {
    render(<CapitalStructureCard fundamentals={{ market_cap: 4_000_000, enterprise_value: 3_900_000 }} />)

    expect(value('Net cash')).toBe('100.00B')
    expect(screen.queryByText('Net debt')).not.toBeInTheDocument()
  })

  it('renders nothing without both figures', () => {
    const { container } = render(<CapitalStructureCard fundamentals={{ market_cap: 4_000_000, enterprise_value: null }} />)

    expect(container).toBeEmptyDOMElement()
  })
})
