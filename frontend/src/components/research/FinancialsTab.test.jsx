import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../../test/renderWithProviders'
import FinancialsTab from './FinancialsTab'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const idle = { data: undefined, isLoading: false, error: null }

const annual = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((fiscal_year, index) => ({
  period: `${fiscal_year}-12-31`,
  fiscal_year,
  label: `FY ${fiscal_year}`,
  income: { revenue: (index + 1) * 10e9, gross_profit: (index + 1) * 6e9, operating_income: (index + 1) * 3e9, net_income: (index + 1) * 2e9 },
  balance: {
    total_assets: (index + 1) * 50e9,
    current_assets: (index + 1) * 20e9,
    total_liabilities: (index + 1) * 30e9,
    current_liabilities: (index + 1) * 10e9,
    cash: (index + 1) * 5e9,
    total_debt: (index + 1) * 6e9,
  },
  cash_flow: { operating_cash_flow: (index + 1) * 4e9, free_cash_flow: (index + 1) * 3e9 },
}))

const quarterly = [1, 2, 3, 4].map((quarter) => ({
  period: `2025-${String(quarter * 3).padStart(2, '0')}-28`,
  fiscal_year: 2025,
  quarter,
  label: `Q${quarter} 2025`,
  income: { revenue: quarter * 1e9, net_income: quarter * 2e8 },
  balance: {},
  cash_flow: {},
}))

const fundamentals = { ...idle, data: { available: true } }

const renderTab = (statements = { available: true, annual, quarterly }, props = {}) => {
  queries.useStatements.mockReturnValue({ ...idle, data: statements })
  return renderWithProviders(<FinancialsTab symbol="NVDA" fundamentals={fundamentals} {...props} />)
}

describe('FinancialsTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks for the statements of the symbol', () => {
    renderTab()

    expect(queries.useStatements).toHaveBeenCalledWith('NVDA')
  })

  it('opens on the annual income statement with the newest six years', () => {
    renderTab()

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Income statement', 'FY 2020', 'FY 2021', 'FY 2022', 'FY 2023', 'FY 2024', 'FY 2025'])
  })

  it('switches to the balance sheet and the cash flow statement', async () => {
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Balance sheet' }))
    expect(screen.getByRole('rowheader', { name: 'Total assets' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cash flow' }))
    expect(screen.getByRole('rowheader', { name: 'Operating cash flow' })).toBeInTheDocument()
  })

  it('switches to quarters', async () => {
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Quarterly' }))

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Income statement', 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'])
  })

  it('goes back to the annual income statement when the symbol changes', async () => {
    queries.useStatements.mockReturnValue({ ...idle, data: { available: true, annual, quarterly } })
    const tree = (symbol) => (
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <FinancialsTab symbol={symbol} fundamentals={fundamentals} />
        </MemoryRouter>
      </QueryClientProvider>
    )
    const { rerender } = render(tree('NVDA'))
    await userEvent.click(screen.getByRole('button', { name: 'Quarterly' }))
    await userEvent.click(screen.getByRole('button', { name: 'Balance sheet' }))

    rerender(tree('AAPL'))

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers[0]).toBe('Income statement')
    expect(headers[1]).toMatch(/^FY /)
  })

  it('shows one unavailable card when an available answer has no annual rows', () => {
    renderTab({ available: true, annual: [], quarterly: [] })

    expect(screen.getByText('Statements are unavailable for NVDA.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Balance sheet' })).not.toBeInTheDocument()
  })

  it('hides the quarterly switch when there are no quarters', () => {
    renderTab({ available: true, annual, quarterly: [] })

    expect(screen.queryByRole('button', { name: 'Quarterly' })).not.toBeInTheDocument()
  })

  it('shows the revenue-to-profit walk for the newest period on screen', () => {
    renderTab()

    const card = screen.getByRole('heading', { name: 'From revenue to profit' }).closest('section')
    expect(within(card).getByText('FY 2025')).toBeInTheDocument()
    expect(within(card).getByText('70.00B')).toBeInTheDocument()
  })

  it('says a balance sheet is missing instead of showing an empty table', async () => {
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Quarterly' }))
    await userEvent.click(screen.getByRole('button', { name: 'Balance sheet' }))

    expect(screen.getByText(/no balance sheet figures for these periods/i)).toBeInTheDocument()
  })

  it('shows a skeleton while the statements load', () => {
    queries.useStatements.mockReturnValue({ ...idle, isLoading: true })
    renderWithProviders(<FinancialsTab symbol="NVDA" fundamentals={fundamentals} />)

    expect(screen.getByTestId('financials-loading')).toBeInTheDocument()
  })

  it('explains when statements are unavailable', () => {
    renderTab({ available: false, reason: 'Market data is not configured.' })

    expect(screen.getByText('Market data is not configured.')).toBeInTheDocument()
  })

  it('falls back to its own words when no reason is given', () => {
    renderTab({ available: false })

    expect(screen.getByText(/statements are unavailable for NVDA/i)).toBeInTheDocument()
  })

  it('keeps the margin trend when statements are unavailable', () => {
    queries.useStatements.mockReturnValue({ ...idle, data: { available: false } })
    const quarterly_trends = [
      { period: '2025-03-31', gross_margin: 60, operating_margin: 30, net_margin: 20 },
      { period: '2025-06-30', gross_margin: 61, operating_margin: 31, net_margin: 21 },
    ]
    renderWithProviders(
      <FinancialsTab symbol="NVDA" fundamentals={{ ...idle, data: { available: true, quarterly_trends } }} />,
    )

    expect(screen.getByRole('heading', { name: /margin/i })).toBeInTheDocument()
  })

  it('shows the cash and debt and the assets against liabilities charts after the profit walk', () => {
    renderTab()

    const walk = screen.getByRole('heading', { name: 'From revenue to profit' })
    const cash = screen.getByRole('heading', { name: 'Cash and debt' })
    const balance = screen.getByRole('heading', { name: 'Assets against liabilities' })
    expect(walk.compareDocumentPosition(cash) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(cash.compareDocumentPosition(balance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps both health charts when Quarterly is chosen', async () => {
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Quarterly' }))

    expect(screen.getByRole('heading', { name: 'Cash and debt' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Assets against liabilities' })).toBeInTheDocument()
  })

  it('shows neither health chart nor the old cash card when statements are unavailable', () => {
    renderTab({ available: false })

    expect(screen.queryByRole('heading', { name: 'Cash and debt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Assets against liabilities' })).not.toBeInTheDocument()
    expect(screen.queryByText('Cash generation & balance sheet')).not.toBeInTheDocument()
  })

  it('offers a retry when the statements request failed', async () => {
    const refetch = vi.fn()
    queries.useStatements.mockReturnValue({ ...idle, error: new Error('boom'), refetch })
    renderWithProviders(<FinancialsTab symbol="NVDA" fundamentals={fundamentals} />)

    expect(screen.getByText('Statements could not be loaded.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('says so when only the annual reports could be loaded', () => {
    renderTab({ available: true, partial: true, annual, quarterly: [] })

    expect(
      screen.getByText('Quarterly figures could not be loaded; showing annual reports only.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quarterly' })).not.toBeInTheDocument()
  })

  it('does not claim a partial answer when the quarters are simply absent', () => {
    renderTab({ available: true, partial: false, annual, quarterly: [] })

    expect(screen.queryByText(/quarterly figures could not be loaded/i)).not.toBeInTheDocument()
  })
})
