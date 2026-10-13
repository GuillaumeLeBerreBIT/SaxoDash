import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import KeyFactsStrip from './KeyFactsStrip'

const facts = {
  market_cap: 4_976_177,
  pe_ratio: 34.8,
  eps_ttm: 7.46,
  dividend_yield: 0.41,
  ipo_date: '1980-12-12',
  industry: 'Technology',
  country: 'US',
  website: 'https://www.apple.com/',
}

const value = (label) => screen.getByText(label).parentElement.querySelector('dd').textContent

describe('KeyFactsStrip', () => {
  it('shows the key facts', () => {
    render(<KeyFactsStrip fundamentals={facts} />)

    expect(value('Market cap')).toBe('4.98T')
    expect(value('P/E')).toBe('34.80')
    expect(value('EPS (TTM)')).toBe('7.46')
    expect(value('Dividend yield')).toBe('0.41%')
    expect(value('Listed since')).toBe('1980')
    expect(value('Industry')).toBe('Technology')
    expect(value('Country')).toBe('US')
  })

  it('links the website by its host name, opening safely in a new tab', () => {
    render(<KeyFactsStrip fundamentals={facts} />)

    const link = screen.getByRole('link', { name: 'apple.com' })
    expect(link).toHaveAttribute('href', 'https://www.apple.com/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('leaves out a fact the provider did not send', () => {
    render(<KeyFactsStrip fundamentals={{ market_cap: 100, website: '', country: '', ipo_date: null }} />)

    expect(screen.getByText('Market cap')).toBeInTheDocument()
    expect(screen.queryByText('Website')).not.toBeInTheDocument()
    expect(screen.queryByText('Country')).not.toBeInTheDocument()
    expect(screen.queryByText('Listed since')).not.toBeInTheDocument()
    expect(screen.queryByText('P/E')).not.toBeInTheDocument()
  })

  it('does not link a website that is not http or https', () => {
    render(<KeyFactsStrip fundamentals={{ market_cap: 100, website: 'javascript:alert(1)' }} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders nothing with no facts at all', () => {
    const { container } = render(<KeyFactsStrip fundamentals={{}} />)

    expect(container).toBeEmptyDOMElement()
  })
})
