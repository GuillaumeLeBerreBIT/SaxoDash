import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../test/renderWithProviders'
import CommandPalette from './CommandPalette'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  queries.useInstrumentSearch.mockReturnValue({ data: [], isLoading: false, error: null })
})
afterEach(() => localStorage.clear())

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    renderWithProviders(<CommandPalette open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows recent symbols when the query is empty', () => {
    localStorage.setItem('saxodash:recent-symbols', JSON.stringify(['NVDA', 'AAPL']))
    renderWithProviders(<CommandPalette open onClose={() => {}} />)
    expect(screen.getByRole('option', { name: /NVDA/ })).toBeInTheDocument()
  })

  it('lists instrument results once the query is long enough', async () => {
    queries.useInstrumentSearch.mockReturnValue({
      data: [{ symbol: 'TSLA', description: 'Tesla Inc', exchange: 'NASDAQ', uic: 9, asset_type: 'Stock' }],
      isLoading: false, error: null,
    })
    renderWithProviders(<CommandPalette open onClose={vi.fn()} />)
    await userEvent.type(screen.getByRole('combobox'), 'tsla')
    expect(screen.getByRole('option', { name: /TSLA/ })).toBeInTheDocument()
  })

  it('navigates to Research on selecting an instrument', async () => {
    queries.useInstrumentSearch.mockReturnValue({
      data: [{ symbol: 'TSLA', description: 'Tesla Inc', exchange: 'NASDAQ', uic: 9, asset_type: 'Stock' }],
      isLoading: false, error: null,
    })
    const onClose = vi.fn()
    renderWithProviders(<CommandPalette open onClose={onClose} />)
    await userEvent.type(screen.getByRole('combobox'), 'tsla')
    await userEvent.click(screen.getByRole('option', { name: /TSLA/ }))
    // Pins the uic the search already resolved, so an ambiguous ticker
    // (e.g. "NOW" - ServiceNow vs. NowVertical) can't re-resolve wrong.
    expect(navigate).toHaveBeenCalledWith('/research?symbol=TSLA&uic=9&assetType=Stock')
    expect(onClose).toHaveBeenCalled()
  })

  it('filters page commands by the query', async () => {
    renderWithProviders(<CommandPalette open onClose={vi.fn()} />)
    await userEvent.type(screen.getByRole('combobox'), 'analy')
    expect(screen.getByRole('option', { name: /Analytics/ })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    renderWithProviders(<CommandPalette open onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('still renders when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    renderWithProviders(<CommandPalette open onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
