import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
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
  balance: { total_assets: (index + 1) * 50e9 },
  cash_flow: { operating_cash_flow: (index + 1) * 4e9 },
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

  it('still shows the fundamentals-based charts when statements are unavailable', () => {
    queries.useStatements.mockReturnValue({ ...idle, data: { available: false } })
    const trend = [{ period: '2024-12-31', fcf: 1e9, debt: 2e9, cash: 3e9 }]
    renderWithProviders(
      <FinancialsTab symbol="NVDA" fundamentals={{ ...idle, data: { available: true, cash_flow_trend: trend } }} />,
    )

    expect(screen.getByText('Cash generation & balance sheet')).toBeInTheDocument()
  })
})
