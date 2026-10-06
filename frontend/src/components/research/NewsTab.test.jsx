import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import NewsTab from './NewsTab'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

beforeEach(() => vi.clearAllMocks())

const item = (over) => ({
  id: 1, datetime: '2026-09-09T13:00:00+00:00', headline: 'A headline',
  source: 'Reuters', summary: 'A short summary.', url: 'https://example.com/a', ...over,
})

describe('NewsTab', () => {
  it('renders headlines as external links grouped by day', () => {
    queries.useCompanyNews.mockReturnValue({
      data: {
        available: true,
        items: [
          item({ id: 1, datetime: '2026-09-09T13:00:00+00:00', headline: 'Newer', url: 'https://x/1' }),
          item({ id: 2, datetime: '2026-09-08T09:00:00+00:00', headline: 'Older', url: 'https://x/2' }),
        ],
      },
      isLoading: false,
    })
    render(<NewsTab symbol="AAPL" />)
    const link = screen.getByRole('link', { name: 'Newer' })
    expect(link).toHaveAttribute('href', 'https://x/1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('Older')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows an empty state when there are no items', () => {
    queries.useCompanyNews.mockReturnValue({ data: { available: true, items: [] }, isLoading: false })
    render(<NewsTab symbol="AAPL" />)
    expect(screen.getByText(/No recent news for AAPL/)).toBeInTheDocument()
  })

  it('shows the reason when news is unavailable', () => {
    queries.useCompanyNews.mockReturnValue({
      data: { available: false, reason: 'Market data is not configured.' }, isLoading: false,
    })
    render(<NewsTab symbol="AAPL" />)
    expect(screen.getByText(/not configured/)).toBeInTheDocument()
  })

  const newsItems = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: i,
      url: `https://example.com/${i}`,
      headline: `Headline ${i}`,
      source: 'Wire',
      summary: '',
      datetime: new Date(Date.UTC(2026, 9, 5, 12, 0, 0) - i * 60_000).toISOString(),
    }))

  it('caps the list at ten and reveals more on request', async () => {
    queries.useCompanyNews.mockReturnValue({ data: { available: true, items: newsItems(25) }, isLoading: false })
    render(<NewsTab symbol="AAPL" />)
    expect(screen.getAllByRole('link')).toHaveLength(10)

    await userEvent.click(screen.getByRole('button', { name: /Show more/ }))
    expect(screen.getAllByRole('link')).toHaveLength(20)

    await userEvent.click(screen.getByRole('button', { name: /Show more/ }))
    expect(screen.getAllByRole('link')).toHaveLength(25)
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
  })

  it('shows no Show more button for ten items or fewer', () => {
    queries.useCompanyNews.mockReturnValue({ data: { available: true, items: newsItems(10) }, isLoading: false })
    render(<NewsTab symbol="AAPL" />)
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
  })
})
