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
    expect(screen.getByText('Sep')).toBeInTheDocument()
  })

  it('shows the year on the first month and each January only', () => {
    const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02'].map((month) => ({ month, mspr: 10, change: 1 }))
    render(<InsiderSentimentChart sentiment={months} />)

    const labels = screen.getAllByRole('listitem').map((item) => item.querySelector('[data-month-label]').textContent)
    expect(labels).toEqual(['Oct 25', 'Nov', 'Dec', 'Jan 26', 'Feb'])
    expect(screen.getAllByRole('listitem')[1]).toHaveAccessibleName('Nov 25: 10, net 1 shares')
  })

  it('lets the columns share the full width', () => {
    render(<InsiderSentimentChart sentiment={sentiment} />)

    const item = screen.getAllByRole('listitem')[0]
    expect(item).toHaveClass('flex-1', 'min-w-0')
    expect(item.className).not.toMatch(/max-w-/)
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
