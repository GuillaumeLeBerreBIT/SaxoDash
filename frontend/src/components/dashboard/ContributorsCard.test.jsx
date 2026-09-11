import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ContributorsCard from './ContributorsCard'

describe('ContributorsCard', () => {
  it('names the biggest contributor', () => {
    render(
      <ContributorsCard
        contributors={[
          { ticker: 'NVDA', pnl: '6949.50', contribution_pp: 42.1, share_of_gain_pct: 88 },
          { ticker: 'AAPL', pnl: '900.00', contribution_pp: 5.4, share_of_gain_pct: 11 },
        ]}
      />,
    )
    expect(screen.getByText('Contributors')).toBeInTheDocument()
    expect(screen.getByText(/NVDA drove 88%/)).toBeInTheDocument()
  })

  it('shows a placeholder when empty', () => {
    render(<ContributorsCard contributors={[]} />)
    expect(screen.getByText(/No contribution data/)).toBeInTheDocument()
  })
})
