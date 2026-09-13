import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import ThesisAndRisksCard, { BusinessSummaryCard } from './SymbolNotesCard'

describe('BusinessSummaryCard', () => {
  it('renders the saved summary', () => {
    render(<BusinessSummaryCard note={{ business_summary: 'Makes phones.' }} onSave={() => {}} />)
    expect(screen.getByDisplayValue('Makes phones.')).toBeInTheDocument()
  })

  it('saves on blur only when the value changed', () => {
    const onSave = vi.fn()
    render(<BusinessSummaryCard note={{ business_summary: 'Old' }} onSave={onSave} />)

    const field = screen.getByDisplayValue('Old')
    fireEvent.blur(field)
    expect(onSave).not.toHaveBeenCalled()

    fireEvent.change(field, { target: { value: 'New' } })
    fireEvent.blur(field)
    expect(onSave).toHaveBeenCalledWith({ business_summary: 'New' })
  })
})

describe('ThesisAndRisksCard', () => {
  it('renders the bull, bear, target price and sell trigger fields', () => {
    render(
      <ThesisAndRisksCard
        note={{ bull_case: 'Growth', bear_case: 'Competition', target_price: '250.00', sell_trigger: 'Margin drop' }}
        onSave={() => {}}
        fundamentals={{ data: { available: false } }}
      />,
    )
    expect(screen.getByDisplayValue('Growth')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Competition')).toBeInTheDocument()
    expect(screen.getByDisplayValue('250.00')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Margin drop')).toBeInTheDocument()
  })

  it('shows a leverage flag when the fundamentals verdict is cautionary', () => {
    render(
      <ThesisAndRisksCard
        note={null}
        onSave={() => {}}
        fundamentals={{ data: { available: true, debt_to_equity: 5, current_ratio: 0.4 } }}
      />,
    )
    expect(screen.getByText(/leveraged or tight on liquidity/i)).toBeInTheDocument()
  })

  it('omits the leverage flag without a cautionary verdict', () => {
    render(<ThesisAndRisksCard note={null} onSave={() => {}} fundamentals={{ data: { available: false } }} />)
    expect(screen.queryByText(/leveraged/i)).not.toBeInTheDocument()
  })
})
