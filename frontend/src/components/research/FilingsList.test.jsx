import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import FilingsList from './FilingsList'

const filing = (form, filed, overrides = {}) => ({
  form,
  filed,
  accepted: `${filed} 16:05:00`,
  url: `https://www.sec.gov/Archives/${form}-${filed}.htm`,
  report_url: '',
  accession: `${form}-${filed}`,
  ...overrides,
})

const filings = [filing('8-K', '2026-09-20'), filing('10-Q', '2026-08-28'), filing('10-K', '2026-02-26')]

describe('FilingsList', () => {
  it('lists each filing with its badge, plain label and date', () => {
    render(<FilingsList filings={filings} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Annual report')).toBeInTheDocument()
    expect(screen.getByText('Quarterly report')).toBeInTheDocument()
    expect(screen.getByText('Current report')).toBeInTheDocument()
    expect(screen.getByText('26 Feb 2026')).toBeInTheDocument()
  })

  it('links to SEC.gov in a new tab with a name that includes the form and date', () => {
    render(<FilingsList filings={filings} />)

    const link = screen.getByRole('link', { name: /10-K.*26 Feb 2026/ })
    expect(link).toHaveTextContent('Open on SEC.gov')
    expect(link).toHaveAttribute('href', 'https://www.sec.gov/Archives/10-K-2026-02-26.htm')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('falls back to the report url', () => {
    render(<FilingsList filings={[filing('10-K', '2026-02-26', { url: '', report_url: 'https://www.sec.gov/report.htm' })]} />)

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://www.sec.gov/report.htm')
  })

  it('renders no link when neither url is on sec.gov', () => {
    render(<FilingsList filings={[filing('10-K', '2026-02-26', { url: 'https://evil.example/x', report_url: 'javascript:alert(1)' })]} />)

    expect(screen.getByText('Annual report')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers chips only for the forms present, filters and restores', async () => {
    render(<FilingsList filings={[filing('10-K', '2026-02-26'), filing('10-Q', '2026-08-28')]} />)

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['All', '10-K', '10-Q'])

    await userEvent.click(screen.getByRole('button', { name: '10-Q' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Quarterly report')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('says so for an empty list', () => {
    render(<FilingsList filings={[]} />)

    expect(screen.getByText('No annual, quarterly or current reports were found for this company.')).toBeInTheDocument()
  })
})
