import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import InvestorTable from './InvestorTable'

const investor = {
  slug: 'a', name: 'Alpha Capital', firm: 'Alpha', stale: false, latest_quarter: '2026-06-30', last_filing_at: '2026-08-14',
  total_value: 1e9, positions: 10, top10_weight: 90, new_count: 0, exited_count: 0, top_holdings: [],
}

describe('InvestorTable', () => {
  it('selects once when the name button is clicked', () => {
    const onSelect = vi.fn()
    render(<InvestorTable investors={[investor]} selected={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /Alpha Capital/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('writes zero movement without signs', () => {
    render(<InvestorTable investors={[investor]} selected={null} onSelect={() => {}} />)
    expect(screen.getByText('0 · 0')).toBeInTheDocument()
  })
})
