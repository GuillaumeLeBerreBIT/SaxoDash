import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import PriceBar from './PriceBar'

describe('PriceBar', () => {
  it('says in words where the price sits against its usual P/E range, without calling it cheap or expensive', () => {
    render(<PriceBar price={353.06} cheapBelow={249.55} expensiveAbove={316.01} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'US$353.06: Upper part. Usual P/E range US$249.55 to US$316.01',
    )
    expect(screen.getByText('Usual P/E low US$249.55')).toBeInTheDocument()
    expect(screen.getByText('Usual P/E high US$316.01')).toBeInTheDocument()
    expect(screen.getByTestId('price-bar')).toHaveAttribute('data-zone', 'expensive')
  })

  it('can leave the level labels out for a compact row', () => {
    render(<PriceBar price={150} cheapBelow={100} expensiveAbove={200} labels={false} />)
    expect(screen.queryByText(/Usual P\/E low/)).not.toBeInTheDocument()
  })

  it('renders nothing when the price cannot be judged', () => {
    const { container } = render(<PriceBar price={150} cheapBelow={null} expensiveAbove={200} />)
    expect(container).toBeEmptyDOMElement()
  })
})
