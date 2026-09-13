import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../test/renderWithProviders'
import InstrumentSearchBar from './InstrumentSearchBar'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}))

const tsla = { symbol: 'TSLA', description: 'Tesla Inc', exchange: 'NASDAQ', uic: 9, asset_type: 'Stock' }
const spy = { symbol: 'SPY', description: 'SPDR S&P 500 ETF Trust', exchange: 'ARCX', uic: 999, asset_type: 'Etf' }

beforeEach(() => {
  vi.clearAllMocks()
  queries.useInstrumentSearch.mockReturnValue({ data: [], isError: false })
})

describe('InstrumentSearchBar', () => {
  it('renders a search input and an All/Stocks/ETFs filter', () => {
    renderWithProviders(<InstrumentSearchBar />)
    expect(screen.getByRole('textbox', { name: /search instruments/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stocks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ETFs' })).toBeInTheDocument()
  })

  it('lists ranked results once the query is long enough', async () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [tsla], isError: false })
    renderWithProviders(<InstrumentSearchBar />)
    await userEvent.type(screen.getByRole('textbox', { name: /search instruments/i }), 'tsla')
    expect(screen.getByText('TSLA')).toBeInTheDocument()
    expect(screen.getByText('Tesla Inc')).toBeInTheDocument()
  })

  it('tags each result as Stock or ETF', async () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [tsla, spy], isError: false })
    renderWithProviders(<InstrumentSearchBar />)
    await userEvent.type(screen.getByRole('textbox', { name: /search instruments/i }), 'sp')
    expect(screen.getByText('Stock')).toBeInTheDocument()
    expect(screen.getByText('ETF')).toBeInTheDocument()
  })

  it('navigates to Research on selecting a result, pinning its uic and asset type', async () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [tsla], isError: false })
    renderWithProviders(<InstrumentSearchBar />)
    await userEvent.type(screen.getByRole('textbox', { name: /search instruments/i }), 'tsla')
    await userEvent.click(screen.getByText('TSLA'))
    expect(navigate).toHaveBeenCalledWith('/research?symbol=TSLA&uic=9&assetType=Stock')
  })

  it('asks for only ETFs when the ETFs filter is active', async () => {
    renderWithProviders(<InstrumentSearchBar />)
    await userEvent.click(screen.getByRole('button', { name: 'ETFs' }))
    await userEvent.type(screen.getByRole('textbox', { name: /search instruments/i }), 'sp')
    expect(queries.useInstrumentSearch).toHaveBeenLastCalledWith('sp', 'Etf')
  })

  it('asks for only stocks when the Stocks filter is active', async () => {
    renderWithProviders(<InstrumentSearchBar />)
    await userEvent.click(screen.getByRole('button', { name: 'Stocks' }))
    await userEvent.type(screen.getByRole('textbox', { name: /search instruments/i }), 'tsla')
    expect(queries.useInstrumentSearch).toHaveBeenLastCalledWith('tsla', 'Stock')
  })

  it('explains a search error as a missing Saxo connection', async () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [], isError: true })
    renderWithProviders(<InstrumentSearchBar />)
    await userEvent.type(screen.getByRole('textbox', { name: /search instruments/i }), 'tsla')
    expect(screen.getByText(/reconnect Saxo/i)).toBeInTheDocument()
  })

  it('dismisses the results on Escape', async () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [tsla], isError: false })
    renderWithProviders(<InstrumentSearchBar />)
    const input = screen.getByRole('textbox', { name: /search instruments/i })
    await userEvent.type(input, 'tsla')
    expect(screen.getByText('TSLA')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('TSLA')).not.toBeInTheDocument()
  })

  it('dismisses the results on an outside click', async () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [tsla], isError: false })
    renderWithProviders(
      <div>
        <InstrumentSearchBar />
        <button type="button">elsewhere</button>
      </div>,
    )
    await userEvent.type(screen.getByRole('textbox', { name: /search instruments/i }), 'tsla')
    expect(screen.getByText('TSLA')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByText('TSLA')).not.toBeInTheDocument()
  })

  it('reopens the results once the query changes again after a dismissal', async () => {
    queries.useInstrumentSearch.mockReturnValue({ data: [tsla], isError: false })
    renderWithProviders(<InstrumentSearchBar />)
    const input = screen.getByRole('textbox', { name: /search instruments/i })
    await userEvent.type(input, 'tsla')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('TSLA')).not.toBeInTheDocument()

    await userEvent.type(input, 'x')
    expect(screen.getByText('TSLA')).toBeInTheDocument()
  })
})
