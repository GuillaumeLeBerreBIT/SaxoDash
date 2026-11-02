import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { CurrencyPanel } from './BalancePanels'

const position = (over) => ({ ticker: 'NVDA', currency: 'USD', value: '500', ...over })

describe('CurrencyPanel', () => {
  it('sums the priced positions of a currency', () => {
    render(<CurrencyPanel positions={[position({ value: '500' }), position({ ticker: 'AMD', value: '250' })]} cash={null} />)
    const row = screen.getByText('USD').closest('li')
    expect(row).toHaveTextContent('2 positions')
    expect(row).toHaveTextContent('750')
  })

  it('shows a dash for a currency whose positions are all unpriced', () => {
    render(<CurrencyPanel positions={[position({ value: null })]} cash={null} />)
    const row = screen.getByText('USD').closest('li')
    expect(row).toHaveTextContent('—')
    expect(row).not.toHaveTextContent('€0')
  })
})
