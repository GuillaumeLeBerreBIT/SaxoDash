import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import AnalystCounts from './AnalystCounts'

describe('AnalystCounts', () => {
  it('pairs each label with its count, term first', () => {
    render(<AnalystCounts rows={[['Sell', 2], ['Buy', 9]]} />)

    const terms = screen.getAllByRole('term').map((term) => term.textContent)
    const counts = screen.getAllByRole('definition').map((definition) => definition.textContent)
    expect(terms).toEqual(['Sell', 'Buy'])
    expect(counts).toEqual(['2', '9'])
    expect(screen.getAllByRole('term')[0].parentElement.firstElementChild.tagName).toBe('DT')
  })
})
