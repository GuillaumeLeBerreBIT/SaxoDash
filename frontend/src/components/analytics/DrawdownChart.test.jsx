import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import DrawdownChart from './DrawdownChart'

describe('DrawdownChart', () => {
  it('shows an empty state for an empty drawdown series', () => {
    render(<DrawdownChart series={[]} maxDrawdown={null} />)

    expect(screen.getByText('No drawdown yet')).toBeInTheDocument()
  })
})
