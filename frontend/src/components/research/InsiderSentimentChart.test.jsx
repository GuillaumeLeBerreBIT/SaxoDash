import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { NEGATIVE, POSITIVE } from '../../lib/charts'
import InsiderSentimentChart from './InsiderSentimentChart'

const sentiment = [
  { month: '2026-08', mspr: 25, change: 400 },
  { month: '2026-09', mspr: -64.04, change: -1952 },
]

const bar = (item) => item.querySelector('[data-bar]')

describe('InsiderSentimentChart', () => {
  it('lists one item per month, oldest first, with an accessible name', () => {
    render(<InsiderSentimentChart sentiment={sentiment} />)

    const list = screen.getByRole('list', { name: 'Insider sentiment by month' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveAccessibleName('Aug 26: 25, net 400 shares')
    expect(items[1]).toHaveAccessibleName('Sep 26: -64.04, net -1,952 shares')
  })

  it('labels each month under its bar', () => {
    render(<InsiderSentimentChart sentiment={sentiment} />)

    expect(screen.getByText('Aug 26')).toBeInTheDocument()
    expect(screen.getByText('Sep 26')).toBeInTheDocument()
  })

  it('draws buying above the centre line in the positive colour and selling below in the negative one', () => {
    render(<InsiderSentimentChart sentiment={sentiment} />)

    const [buying, selling] = screen.getAllByRole('listitem').map(bar)
    expect(buying).toHaveStyle({ backgroundColor: POSITIVE })
    expect(buying.dataset.side).toBe('above')
    expect(selling).toHaveStyle({ backgroundColor: NEGATIVE })
    expect(selling.dataset.side).toBe('below')
  })

  it('sizes each bar by the absolute ratio out of 100', () => {
    render(<InsiderSentimentChart sentiment={sentiment} />)

    const [buying, selling] = screen.getAllByRole('listitem').map(bar)
    expect(buying.style.height).toBe('25%')
    expect(selling.style.height).toBe('64.04%')
  })

  it('explains the scale in a caption', () => {
    render(<InsiderSentimentChart sentiment={sentiment} />)

    expect(screen.getByText('Monthly share purchase ratio: 100 is all buying, -100 all selling.')).toBeInTheDocument()
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(<InsiderSentimentChart sentiment={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
