import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import InvestorTable from './InvestorTable'

vi.mock('../../api/queries', () => ({ useFollowInvestor: () => ({ mutate: vi.fn() }) }))

const investor = {
  slug: 'pershing-square', name: 'Bill Ackman', firm: 'Pershing Square', styles: ['Activist'], followed: false,
  stale: false, latest_quarter: '2026-06-30', last_filing_at: '2026-08-14', total_value: 14e9, positions: 11,
  top10_weight: 98.5, new_count: 2, exited_count: 0, top_holdings: [],
}

describe('InvestorTable', () => {
  it('links each row to the profile and shows its numbers', () => {
    render(<MemoryRouter><InvestorTable investors={[investor]} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /Bill Ackman/ })).toHaveAttribute('href', '/investors/pershing-square')
    expect(screen.getByText('$14.0B')).toBeInTheDocument()
    expect(screen.getByText('+2 · 0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Follow Bill Ackman' })).toBeInTheDocument()
  })
})
