import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import ChangeBadge from './ChangeBadge'
import OptionBadge from './OptionBadge'
import YouBadge from './YouBadge'
import WeightBar from './WeightBar'
import InvestorStats from './InvestorStats'
import LimitsNote from './LimitsNote'

describe('ChangeBadge', () => {
  it('shows Added with up arrow and percent', () => {
    render(<ChangeBadge change="added" pct={3.5} />)
    expect(screen.getByText('▲ Added 4%')).toBeInTheDocument()
  })

  it('shows Trimmed with down arrow and percent', () => {
    render(<ChangeBadge change="trimmed" pct={-7.2} />)
    expect(screen.getByText('▼ Trimmed 7%')).toBeInTheDocument()
  })

  it('shows New in accent blue', () => {
    render(<ChangeBadge change="new" pct={null} />)
    const badge = screen.getByText('New')
    expect(badge).toHaveClass('text-blue-400')
  })

  it('shows Sold out in amber', () => {
    render(<ChangeBadge change="sold_out" pct={null} />)
    const badge = screen.getByText('Sold out')
    expect(badge).toHaveClass('text-amber-400')
  })

  it('shows Unchanged when pct is 0', () => {
    render(<ChangeBadge change="unchanged" pct={0} />)
    expect(screen.getByText('Unchanged')).toBeInTheDocument()
  })
})

describe('OptionBadge', () => {
  it('shows Call', () => {
    render(<OptionBadge putCall="CALL" />)
    expect(screen.getByText('Call')).toBeInTheDocument()
  })

  it('shows Put', () => {
    render(<OptionBadge putCall="PUT" />)
    expect(screen.getByText('Put')).toBeInTheDocument()
  })

  it('shows nothing for empty put_call', () => {
    render(<OptionBadge putCall="" />)
    expect(screen.queryByText(/Call|Put/)).not.toBeInTheDocument()
  })
})

describe('YouBadge', () => {
  it('shows You own when owned is true', () => {
    render(<YouBadge owned={true} watched={false} />)
    expect(screen.getByText('You own')).toBeInTheDocument()
  })

  it('shows You watch when watched is true', () => {
    render(<YouBadge owned={false} watched={true} />)
    expect(screen.getByText('You watch')).toBeInTheDocument()
  })

  it('shows nothing when neither owned nor watched', () => {
    render(<YouBadge owned={false} watched={false} />)
    expect(screen.queryByText(/own|watch/)).not.toBeInTheDocument()
  })

  it('prioritizes owned over watched', () => {
    render(<YouBadge owned={true} watched={true} />)
    expect(screen.getByText('You own')).toBeInTheDocument()
    expect(screen.queryByText('You watch')).not.toBeInTheDocument()
  })
})

describe('WeightBar', () => {
  it('renders a bar scaled to max', () => {
    render(<WeightBar weight={22.04} max={22.04} />)
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('scales to zero width for zero weight', () => {
    render(<WeightBar weight={0} max={22.04} />)
    const bar = screen.getByRole('img')
    expect(bar).toHaveStyle({ width: '0%' })
  })

  it('scales to 50% for half of max', () => {
    render(<WeightBar weight={11.02} max={22.04} />)
    const bar = screen.getByRole('img')
    expect(bar).toHaveStyle({ width: '50%' })
  })

  it('handles null weight', () => {
    render(<WeightBar weight={null} max={22.04} />)
    expect(screen.getByRole('img')).toBeInTheDocument()
  })
})

describe('InvestorStats', () => {
  it('shows top 10 weights and positions count', () => {
    render(
      <InvestorStats
        top10_weight={55.6}
        top10_positions={10}
        total_positions={127}
        filing_date="2026-10-15"
        turnover={12.5}
      />
    )
    expect(screen.getByText('55.6%')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('127')).toBeInTheDocument()
    expect(screen.getByText('Oct 15, 2026')).toBeInTheDocument()
    expect(screen.getByText('12.5%')).toBeInTheDocument()
  })

  it('renders stats with proper labels', () => {
    render(
      <InvestorStats
        top10_weight={55.6}
        top10_positions={10}
        total_positions={127}
        filing_date="2026-10-15"
        turnover={12.5}
      />
    )
    expect(screen.getByText('Top 10')).toBeInTheDocument()
    expect(screen.getByText('Largest')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('Filed')).toBeInTheDocument()
  })

  it('handles null turnover', () => {
    render(
      <InvestorStats
        top10_weight={55.6}
        top10_positions={10}
        total_positions={127}
        filing_date="2026-10-15"
        turnover={null}
      />
    )
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('LimitsNote', () => {
  it('states what 13F cannot show', () => {
    render(<LimitsNote />)
    expect(
      screen.getByText(/US-listed long positions and listed options at quarter end only/)
    ).toBeInTheDocument()
  })
})
