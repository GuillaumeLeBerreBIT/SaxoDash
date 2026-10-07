import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import AddInvestorDialog from './AddInvestorDialog'

const results = [
  { cik: 1336528, name: 'Pershing Square Capital Management, L.P.', last_13f: '2026-08-14', tracked: false, slug: null },
  { cik: 1067983, name: 'BERKSHIRE HATHAWAY INC', last_13f: '2026-08-14', tracked: true, slug: 'berkshire-hathaway' },
  { cik: 2026053, name: 'PERSHING SQUARE INC.', last_13f: null, tracked: false, slug: null },
]

let searched
let searchState
let addState
const add = vi.fn()
vi.mock('../../api/queries', () => ({
  useInvestorSearch: (q) => { searched = q; return searchState },
  useAddInvestor: () => ({ mutate: add, ...addState }),
}))
vi.mock('../../lib/useDebouncedValue', () => ({ useDebouncedValue: (value) => value }))

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname}</p>
}

const onClose = vi.fn()
const renderDialog = () =>
  render(
    <MemoryRouter initialEntries={['/investors']}>
      <Routes><Route path="*" element={<><AddInvestorDialog onClose={onClose} /><Where /></>} /></Routes>
    </MemoryRouter>,
  )

const type = (value) => fireEvent.change(screen.getByRole('searchbox', { name: 'Search 13F filers' }), { target: { value } })

describe('AddInvestorDialog', () => {
  beforeEach(() => {
    searchState = { data: undefined, isFetching: false, error: null }
    addState = { isPending: false, error: null }
    add.mockReset()
    onClose.mockReset()
  })

  it('asks for at least three characters before searching', () => {
    renderDialog()
    type('pe')
    expect(searched).toBe('pe')
    expect(screen.getByText('Type at least 3 characters of a fund or manager name.')).toBeInTheDocument()
  })

  it('lists filers with their last 13F', () => {
    searchState = { data: results, isFetching: false, error: null }
    renderDialog()
    type('pershing')
    const first = screen.getAllByRole('listitem')[0]
    expect(within(first).getByText('Pershing Square Capital Management, L.P.')).toBeInTheDocument()
    expect(within(first).getByText('Last 13F Aug 14, 2026')).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: 'Add Pershing Square Capital Management, L.P.' })).toBeEnabled()
  })

  it('links to an investor already tracked instead of adding it again', () => {
    searchState = { data: results, isFetching: false, error: null }
    renderDialog()
    type('pershing')
    const tracked = screen.getAllByRole('listitem')[1]
    expect(within(tracked).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/investors/berkshire-hathaway')
    expect(within(tracked).queryByRole('button')).not.toBeInTheDocument()
  })

  it('does not offer a company that never filed a 13F', () => {
    searchState = { data: results, isFetching: false, error: null }
    renderDialog()
    type('pershing')
    const never = screen.getAllByRole('listitem')[2]
    expect(within(never).getByText('No 13F on file')).toBeInTheDocument()
    expect(within(never).queryByRole('button')).not.toBeInTheDocument()
  })

  it('adds a filer, closes and opens its profile', () => {
    add.mockImplementation((cik, options) => options.onSuccess({ slug: 'pershing-square-capital-management-lp' }))
    searchState = { data: results, isFetching: false, error: null }
    renderDialog()
    type('pershing')
    fireEvent.click(screen.getByRole('button', { name: 'Add Pershing Square Capital Management, L.P.' }))
    expect(add).toHaveBeenCalledWith(1336528, expect.anything())
    expect(onClose).toHaveBeenCalled()
    expect(screen.getByTestId('where').textContent).toBe('/investors/pershing-square-capital-management-lp')
  })

  it('says so when nothing matches', () => {
    searchState = { data: [], isFetching: false, error: null }
    renderDialog()
    type('zzzz')
    expect(screen.getByText('No 13F filer matches “zzzz”.')).toBeInTheDocument()
  })

  it('shows a failed search without breaking the dialog', () => {
    searchState = { data: undefined, isFetching: false, error: new Error('EDGAR did not answer. Try again in a moment.') }
    renderDialog()
    type('pershing')
    expect(screen.getByText('EDGAR did not answer. Try again in a moment.')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search 13F filers' })).toBeEnabled()
  })

  it('shows why an add was refused', () => {
    addState = { isPending: false, error: new Error('Acme has never filed a 13F.') }
    searchState = { data: results, isFetching: false, error: null }
    renderDialog()
    type('pershing')
    expect(screen.getByText('Acme has never filed a 13F.')).toBeInTheDocument()
  })
})
