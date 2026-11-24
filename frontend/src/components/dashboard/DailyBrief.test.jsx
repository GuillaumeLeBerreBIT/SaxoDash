import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { BriefList } from './DailyBrief'

const item = { kind: 'trim', ticker: 'ACME', uic: 7, title: 'Acme Corp', body: 'Above your cap.', word: 'Trim', tone: 'warn' }

const renderList = (props) =>
  render(
    <MemoryRouter>
      <BriefList {...props} />
    </MemoryRouter>,
  )

describe('BriefList', () => {
  it('shows the nothing-to-do line when there are no items and no note', () => {
    renderList({ items: [] })
    expect(screen.getByText(/Nothing to do today/)).toBeInTheDocument()
  })

  it('shows the note in place of the nothing-to-do line when there are no items', () => {
    renderList({ items: [], note: 'Checks still loading.' })
    expect(screen.getByText('Checks still loading.')).toBeInTheDocument()
    expect(screen.queryByText(/Nothing to do today/)).not.toBeInTheDocument()
  })

  it('lists the items and adds the note beneath them', () => {
    renderList({ items: [item], note: 'Two checks are unanswered.' })
    const list = screen.getByTestId('brief-items')
    expect(within(list).getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('Two checks are unanswered.')).toBeInTheDocument()
  })

  it('shows no note line beside the items when there is no note', () => {
    renderList({ items: [item] })
    expect(screen.getByTestId('brief-items')).toBeInTheDocument()
    expect(screen.queryByText(/unanswered/)).not.toBeInTheDocument()
  })
})
