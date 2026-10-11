import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import ReviewQueue from './ReviewQueue'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const tx = (id, name, amount = '-12.50') => ({
  id, counterparty_name: name, amount, booking_date: '2026-10-03', effective_category: 'OTHER',
})

function mockQueue(rows, { setCategory = vi.fn(), markReviewed = vi.fn() } = {}) {
  queries.useBankTransactions.mockReturnValue({ data: rows, isLoading: false, error: null })
  queries.useUpdateBankTransactionCategory.mockReturnValue({ mutate: setCategory })
  queries.useMarkTransactionReviewed.mockReturnValue({ mutate: markReviewed })
}

describe('ReviewQueue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks the backend only for rows that need review', () => {
    mockQueue([])
    renderWithProviders(<ReviewQueue />)
    expect(queries.useBankTransactions).toHaveBeenCalledWith('?needs_review=true')
  })

  it('renders nothing when the queue is empty', () => {
    mockQueue([])
    const { container } = renderWithProviders(<ReviewQueue />)
    expect(container).toBeEmptyDOMElement()
  })

  it('counts and lists the transactions waiting for a category', () => {
    mockQueue([tx(1, 'ACME SHOP'), tx(2, 'CORNER BAKERY', '-3.20')])
    renderWithProviders(<ReviewQueue />)
    expect(screen.getByRole('heading', { name: /Needs review/ })).toHaveTextContent('2')
    expect(screen.getByText('ACME SHOP')).toBeInTheDocument()
    expect(screen.getByText('CORNER BAKERY')).toBeInTheDocument()
  })

  it('assigns the category picked for that row', () => {
    const setCategory = vi.fn()
    mockQueue([tx(7, 'ACME SHOP')], { setCategory })
    renderWithProviders(<ReviewQueue />)
    fireEvent.change(screen.getByLabelText('Category for ACME SHOP'), { target: { value: 'DINING' } })
    expect(setCategory).toHaveBeenCalledWith({ id: 7, category: 'DINING' })
  })

  it('keeps a row as Other without changing its category', () => {
    const markReviewed = vi.fn()
    mockQueue([tx(7, 'ACME SHOP')], { markReviewed })
    renderWithProviders(<ReviewQueue />)
    fireEvent.click(screen.getByRole('button', { name: 'Keep ACME SHOP as Other' }))
    expect(markReviewed).toHaveBeenCalledWith(7)
  })

  it('shows the first rows and says how many more wait', () => {
    mockQueue(Array.from({ length: 13 }, (_, i) => tx(i + 1, `SHOP ${i + 1}`)))
    renderWithProviders(<ReviewQueue />)
    expect(screen.getByText('SHOP 10')).toBeInTheDocument()
    expect(screen.queryByText('SHOP 11')).not.toBeInTheDocument()
    expect(screen.getByText('3 more after these')).toBeInTheDocument()
  })
})
