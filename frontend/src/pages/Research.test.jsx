import { describe, expect, it, vi, beforeEach } from 'vitest'
import { expectValidHeadingOutline } from '../test/headingOutline'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../test/renderWithProviders'
import { fmtDate } from '../lib/format'
import { WIDEST_RANGE_COUNT } from '../lib/research'
import Research from './Research'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const bars = Array.from({ length: 40 }, (_, i) => ({
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 1_000_000,
}))

const position = {
  ticker: 'NVDA',
  name: 'NVIDIA Corporation',
  uic: 211,
  asset_type: 'Stock',
  qty: 15,
  avg_cost: '412.30',
  value: '13131.00',
  pnl: '6949.50',
  pnl_pct: '112.35',
}

const etfPosition = {
  ticker: 'SPY',
  name: 'SPDR S&P 500 ETF Trust',
  uic: 999,
  asset_type: 'Etf',
  qty: 10,
  avg_cost: '450.00',
  value: '5000.00',
  pnl: '500.00',
  pnl_pct: '11.11',
}

const idle = { data: undefined, isLoading: false, error: null }

function stubQueries({ chart = { data: bars, isLoading: false, error: null }, positions = [position] } = {}) {
  queries.usePositions.mockReturnValue({ ...idle, data: positions })
  queries.useChart.mockReturnValue(chart)
  queries.useInstrumentDetails.mockReturnValue({
    ...idle,
    data: { symbol: 'NVDA', description: 'NVIDIA Corporation', exchange: 'NASDAQ', currency: 'USD', uic: 211 },
  })
  queries.useInstrumentSearch.mockReturnValue({ ...idle, data: [] })
  queries.useQuotes.mockReturnValue({ ...idle, data: [{ uic: 211, price: 875.4, change_pct: 1.42 }] })
  queries.useQuotesByAssetType.mockReturnValue({ data: [], isLoading: false })
  queries.useWatchlists.mockReturnValue({ ...idle, data: [] })
  queries.useVerdictSummary.mockReturnValue(idle)
  queries.useSignals.mockReturnValue(idle)
  queries.useStockSignals.mockReturnValue(idle)
  queries.useWatchlistMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    rename: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
    addItem: { mutate: vi.fn() },
    removeItem: { mutate: vi.fn() },
  })
  queries.useSaxoStatus.mockReturnValue({ ...idle, data: { connected: true } })
  queries.useOwnership.mockReturnValue({ ...idle, data: { quarter: null, filed: 0, tracked: 0, stock: null, funds: [] } })
  queries.useCongressOwnership.mockReturnValue({ ...idle, data: { window_days: 365, stock: null, members: [] } })
  queries.useFundamentals.mockReturnValue({ ...idle, data: { available: false, reason: 'not configured' } })
  queries.useSymbolEarnings.mockReturnValue({ ...idle, data: { available: false, reason: 'x' } })
  queries.useStatements.mockReturnValue({ ...idle, data: { available: false } })
  queries.useCompanyNews.mockReturnValue({ ...idle, data: { available: true, items: [] } })
  queries.usePeers.mockReturnValue({ ...idle, data: { available: false } })
  queries.useFilings.mockReturnValue({ ...idle, data: { available: true, filings: [] } })
  queries.useInsiders.mockReturnValue({ ...idle, data: { available: true, transactions: [], summary: null, sentiment: [] } })
  queries.usePeerFundamentals.mockReturnValue([])
  queries.useMarkReviewedMutation.mockReturnValue({ mutate: vi.fn(), isPending: false })
  queries.useSymbolNote.mockReturnValue({ ...idle, data: { symbol: 'NVDA', target_price: '130.00' } })
  queries.useSymbolNoteMutation.mockReturnValue({ mutate: vi.fn() })
  queries.useNoteLevelMutation.mockReturnValue({ mutate: vi.fn() })
  queries.usePriceLines.mockReturnValue({ ...idle, data: [{ id: 7, uic: 211, asset_type: 'Stock', price: '120.00' }] })
  queries.usePriceLineMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    update: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  })
  queries.useTrendLines.mockReturnValue({ ...idle, data: [] })
  queries.useTrendLineMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    update: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  })
  queries.useTextAnnotations.mockReturnValue({ ...idle, data: [] })
  queries.useTextAnnotationMutations.mockReturnValue({
    create: { mutate: vi.fn() },
    update: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  })
}

const showAdvanced = () => localStorage.setItem('saxodash:research-chart-view', 'advanced')

describe('Research', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    stubQueries()
  })

  it('has exactly one h1 and no skipped heading level', () => {
    const { container } = renderWithProviders(<Research />, { route: '/research?symbol=AAPL' })
    expectValidHeadingOutline(container)
  })

  it('shows the symbol from the query string', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=AAPL' })

    expect(screen.getByText('AAPL')).toBeInTheDocument()
  })

  it('leaves instrument search to the top bar and the watchlist, with no second search in the header', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=AAPL' })

    expect(screen.queryByRole('textbox', { name: /search instruments/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Any instrument/ })).not.toBeInTheDocument()
  })

  it('shows the instrument logo in the symbol bar, keyed on the ticker symbol', () => {
    const { container } = renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    const logo = container.querySelector('img')
    expect(logo).toHaveAttribute('src', 'https://api.elbstream.com/logos/symbol/NVDA')
  })

  it('falls back to a letter avatar in the symbol bar when the logo fails to load', () => {
    const { container } = renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    fireEvent.error(container.querySelector('img'))

    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getAllByText('NV').length).toBeGreaterThan(0)
  })

  it('falls back to the first held position when no symbol is given', () => {
    renderWithProviders(<Research />, { route: '/research' })

    // NVDA labels both the symbol bar and the instrument card below it.
    expect(screen.getAllByText(/^NVDA/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/You own it/).length).toBeGreaterThan(0)
  })

  it('marks an instrument that is in the portfolio as held', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getAllByText(/You own it/).length).toBeGreaterThan(0)
  })

  const thrust = {
    key: 'volume_thrust', code: 'VT', label: 'Volume thrust', description: 'Closed higher on heavy volume.',
    kind: 'event', grade: 'supported', period: { from: '2023-02-15', to: '2026-08-20' },
    horizons: { 60: { mean_excess: 0.027, cases: 1295 } },
  }
  const stockSignals = (uic = 211) => ({
    ticker: 'NVDA', uic, as_of: bars.at(-1).date, active: ['volume_thrust'],
    events: { volume_thrust: [bars.at(-3).date] },
  })

  const judged = { action: 'wait', reason: 'Quality passes; price is not in its cheap range', quality: 'strong', valuation: 'fair', cheap_below: 100, expensive_above: 200, uic: 211, checks: [] }

  it('describes today\'s usual P/E range as a rule of thumb once, in the answer, and offers no past P/E band', async () => {
    showAdvanced()
    queries.useVerdict.mockReturnValue({
      ...idle,
      data: { ...judged, current_pe: 19.8, pe_p25: 45, pe_p75: 77 },
    })

    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.queryByTestId('entry-banner')).not.toBeInTheDocument()
    expect(screen.queryByTestId('price-zones')).not.toBeInTheDocument()
    const card = screen.getByTestId('answer-card')
    expect(card).toHaveTextContent('Strong company, P/E within its usual range.')
    expect(card).toHaveTextContent('Its usual P/E of 45 to 77 spans US$100.00 to US$200.00. A rule of thumb, not a buy signal.')
    expect(screen.queryByTestId('value-zones')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guides' }))
    for (const name of [/52-week high/, /Volume gaps/]) {
      expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('menuitem', { name: /P\/E/ })).not.toBeInTheDocument()
  })

  it('says the price cannot be judged without a usual P/E range', () => {
    queries.useVerdict.mockReturnValue({ ...idle, data: judged })

    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByTestId('answer-card')).toHaveTextContent('Too little P/E history to judge the price.')
  })

  it('keeps the stop-loss off until it is switched on, then draws it against today\'s close and your average price', async () => {
    showAdvanced()
    const held = { ...position, currency: 'USD', fx_rate: '1', value: '1000', avg_cost: '50' }
    queries.usePortfolioSummary.mockReturnValue({ ...idle, data: { total_value: '100000' } })
    queries.usePositions.mockReturnValue({ ...idle, data: [held], isSuccess: true })

    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.queryByTestId('stop-guide')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guides' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Stop-loss/ }))
    expect(screen.getByTestId('stop-guide')).toHaveTextContent(/Stop-loss .+ below today's close/)
    expect(screen.getByTestId('entry-banner')).toHaveTextContent(/above your average price of \S*50\.00\. Adding \d+ shares today would risk/)
  })

  it('lists the active signals with their evidence on the Overview', () => {
    queries.useVerdict.mockReturnValue({ ...idle, data: null })
    queries.useSignals.mockReturnValue({ ...idle, data: [thrust] })
    queries.useStockSignals.mockReturnValue({ ...idle, data: stockSignals() })

    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByRole('heading', { name: 'Setup' })).toBeInTheDocument()
    expect(screen.getByText('+2.7% against the average stock over 60 sessions, 1,295 cases')).toBeInTheDocument()
  })

  it('sizes a trade only once your positions have loaded', async () => {
    const held = { ...position, currency: 'USD', fx_rate: '1', value: '1000' }
    queries.usePortfolioSummary.mockReturnValue({ ...idle, data: { total_value: '100000' } })
    queries.usePositions.mockReturnValue({ ...idle, data: [held], isSuccess: true })
    const { unmount } = renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })
    await userEvent.click(screen.getByRole('tab', { name: 'Notes and plan' }))
    expect(screen.getByRole('heading', { name: 'Trade plan' })).toBeInTheDocument()
    expect(screen.getByText(/Size at 1% risk/)).toBeInTheDocument()
    unmount()

    queries.usePositions.mockReturnValue({ ...idle, data: [held], isSuccess: false, isLoading: true })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA&tab=notes' })
    expect(screen.getByRole('heading', { name: 'Trade plan' })).toBeInTheDocument()
    expect(screen.queryByText(/Size at/)).not.toBeInTheDocument()
  })

  it('shows no signals computed for a different listing of the same ticker', () => {
    queries.useSignals.mockReturnValue({ ...idle, data: [thrust] })
    queries.useStockSignals.mockReturnValue({ ...idle, data: stockSignals(999) })

    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.queryByRole('button', { name: /Signals/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Setup' })).not.toBeInTheDocument()
  })

  it('names the verdict action once, in the answer card and not beside the company name', () => {
    queries.useVerdict.mockReturnValue({
      ...idle,
      data: { action: 'trim', reason: 'Over your 15% cap and expensive against its own history', checks: [] },
    })

    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    const heading = screen.getByRole('heading', { level: 1 })
    expect(within(heading.parentElement).queryByText('Trim')).not.toBeInTheDocument()
    expect(screen.getByTestId('answer-card')).toHaveTextContent('TRIM')
  })

  it('shows no verdict action in the header when there is no verdict', () => {
    queries.useVerdict.mockReturnValue({ ...idle, data: null })

    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    const heading = screen.getByRole('heading', { level: 1 })
    expect(within(heading.parentElement).queryByText('—')).not.toBeInTheDocument()
  })

  it('does not mark an instrument that is not held', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=TSLA' })

    expect(screen.queryByText(/You own it/)).not.toBeInTheDocument()
  })

  it('fetches the widest range once and slices it, rather than refetching per range', async () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    const widest = expect.objectContaining({
      uic: 211,
      assetType: 'Stock',
      count: WIDEST_RANGE_COUNT,
      horizon: 1440,
    })
    expect(queries.useChart).toHaveBeenLastCalledWith(widest)

    await userEvent.click(screen.getByRole('button', { name: '1W' }))

    expect(queries.useChart).toHaveBeenLastCalledWith(widest)
  })

  it('shows only the bars the chosen range covers', async () => {
    showAdvanced()
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    // 1W is seven bars, so the legend lands on the last of the forty stubbed.
    await userEvent.click(screen.getByRole('button', { name: '1W' }))

    expect(screen.getByText(fmtDate(bars[bars.length - 1].date))).toBeInTheDocument()
    expect(screen.queryByText(fmtDate(bars[0].date))).not.toBeInTheDocument()
  })

  it('shows the live position card on the overview tab', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByTestId('answer-you')).toBeInTheDocument()
  })

  it('shows the statistics tab, using the fundamentals already fetched for overview', async () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    await userEvent.click(screen.getByRole('tab', { name: 'Fundamentals' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Statistics' }))

    expect(screen.getByText(/not configured/)).toBeInTheDocument()
  })

  it('shows the peers tab, gated the same way as valuation on unconfigured fundamentals', async () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    await userEvent.click(screen.getByRole('tab', { name: 'Fundamentals' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Peers' }))

    expect(screen.getByText(/not configured/)).toBeInTheDocument()
  })

  it('opens on the Funds tab for a ?tab=funds link, for an ETF too', () => {
    queries.useOwnership.mockReturnValue({ ...idle, data: { quarter: null, filed: 0, tracked: 0, stock: null, funds: [] } })
    stubQueries({ positions: [etfPosition] })
    renderWithProviders(<Research />, { route: '/research?symbol=SPY&tab=funds' })

    expect(screen.getByRole('tab', { name: 'Funds' })).toHaveAttribute('aria-selected', 'true')
    expect(queries.useOwnership).toHaveBeenCalledWith('SPY')
    expect(within(screen.getByRole('tabpanel')).getByText('No 13F filings imported yet')).toBeInTheDocument()
  })

  it('opens on the Earnings tab when ?tab=earnings is in the URL', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=AAPL&tab=earnings' })
    expect(screen.getByRole('tab', { name: 'Earnings' })).toHaveAttribute('aria-selected', 'true')
  })

  it('hides the Fundamentals group and the company-only Filings tab for an ETF', async () => {
    stubQueries({ positions: [etfPosition] })
    renderWithProviders(<Research />, { route: '/research?symbol=SPY' })

    expect(screen.queryByRole('tab', { name: 'Fundamentals' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Notes and plan' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }))
    expect(screen.queryByRole('tab', { name: 'Filings' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'News' })).toBeInTheDocument()
  })

  it('groups the tabs in reading order, with each group\'s sections under it', async () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    const groups = within(screen.getByRole('tablist', { name: 'Instrument sections' })).getAllByRole('tab')
    expect(groups.map((tab) => tab.textContent)).toEqual(['Overview', 'Fundamentals', 'Activity', 'Notes and plan'])
    const sectionsOf = async (group) => {
      await userEvent.click(screen.getByRole('tab', { name: group }))
      const sections = screen.getByRole('tablist', { name: `${group} sections` })
      return within(sections).getAllByRole('tab').map((tab) => tab.textContent)
    }
    expect(await sectionsOf('Fundamentals')).toEqual(['Financials', 'Statistics', 'Peers', 'Earnings'])
    expect(await sectionsOf('Activity')).toEqual(['Funds', 'Congress', 'Filings', 'News'])
    expect(await sectionsOf('Notes and plan')).toEqual(['Notes', 'Guide'])
  })

  it('opens Statistics for the old ?tab=valuation link', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA&tab=valuation' })

    expect(screen.getByRole('tab', { name: 'Fundamentals' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Statistics' })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens the Financials tab from ?tab=financials and asks for the statements', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA&tab=financials' })

    expect(screen.getByRole('tab', { name: 'Financials' })).toHaveAttribute('aria-selected', 'true')
    expect(queries.useStatements).toHaveBeenCalledWith('NVDA')
  })

  it('does not ask for statements on the other tabs', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(queries.useStatements).not.toHaveBeenCalledWith('NVDA')
  })

  it('opens the Filings tab from ?tab=filings and asks for both datasets', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA&tab=filings' })

    expect(screen.getByRole('tab', { name: 'Filings' })).toHaveAttribute('aria-selected', 'true')
    expect(queries.useFilings).toHaveBeenCalledWith('NVDA')
    expect(queries.useInsiders).toHaveBeenCalledWith('NVDA')
    expect(screen.getByRole('heading', { name: 'SEC filings' })).toBeInTheDocument()
  })

  it('does not ask for filings or insiders on the other tabs', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(queries.useFilings).not.toHaveBeenCalledWith('NVDA')
    expect(queries.useInsiders).not.toHaveBeenCalledWith('NVDA')
  })

  it('falls back to Overview when ?tab=filings is opened for an ETF', () => {
    stubQueries({ positions: [etfPosition] })
    renderWithProviders(<Research />, { route: '/research?symbol=SPY&tab=filings' })

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(queries.useFilings).not.toHaveBeenCalledWith('SPY')
  })

  it('falls back to Overview when ?tab=financials is opened for an ETF', () => {
    stubQueries({ positions: [etfPosition] })
    renderWithProviders(<Research />, { route: '/research?symbol=SPY&tab=financials' })

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  })

  it('falls back to Overview when a stale ?tab does not apply to an ETF', () => {
    stubQueries({ positions: [etfPosition] })
    renderWithProviders(<Research />, { route: '/research?symbol=SPY&tab=valuation' })

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  })

  it('badges an ETF instrument in the symbol bar', () => {
    stubQueries({ positions: [etfPosition] })
    renderWithProviders(<Research />, { route: '/research?symbol=SPY' })

    expect(screen.getByText('ETF')).toBeInTheDocument()
  })

  it('does not badge a stock as an ETF', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.queryByText('ETF')).not.toBeInTheDocument()
  })

  it('shows a placeholder instead of a chart while the candles load', () => {
    stubQueries({ chart: { data: undefined, isLoading: true, error: null } })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('explains a 409 as a missing Saxo connection rather than a failure', () => {
    stubQueries({
      chart: { data: undefined, isLoading: false, error: Object.assign(new Error('nope'), { status: 409 }) },
    })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByText(/Saxo is not connected/)).toBeInTheDocument()
  })

  it('holds an equity tab back while the instrument is still being looked up', () => {
    stubQueries({ positions: [] })
    queries.useInstrumentSearch.mockReturnValue({ ...idle, data: [], isResolving: true })
    renderWithProviders(<Research />, { route: '/research?symbol=WHAT&tab=filings' })

    expect(queries.useFilings).not.toHaveBeenCalledWith('WHAT')
    expect(queries.useInsiders).not.toHaveBeenCalledWith('WHAT')
    expect(queries.useFundamentals).not.toHaveBeenCalledWith('WHAT')
    expect(screen.getByTestId('tab-pending')).toBeInTheDocument()
  })

  it('holds the Financials tab back the same way', () => {
    stubQueries({ positions: [] })
    queries.useInstrumentSearch.mockReturnValue({ ...idle, data: [], isResolving: true })
    renderWithProviders(<Research />, { route: '/research?symbol=WHAT&tab=financials' })

    expect(queries.useStatements).not.toHaveBeenCalledWith('WHAT')
    expect(screen.getByTestId('tab-pending')).toBeInTheDocument()
  })

  it('does not ask about the new symbol with the previous symbol\'s search result', () => {
    stubQueries({ positions: [] })
    queries.useInstrumentDetails.mockReturnValue({ ...idle, data: { currency: 'USD' } })
    queries.useInstrumentSearch.mockReturnValue({
      ...idle,
      data: [{ symbol: 'NVDA', uic: 7, asset_type: 'Stock', currency: 'USD' }],
      isResolving: true,
    })
    renderWithProviders(<Research />, { route: '/research?symbol=BBBB&tab=filings' })

    expect(screen.getByTestId('tab-pending')).toBeInTheDocument()
    for (const hook of [queries.useFundamentals, queries.useFilings, queries.useInsiders, queries.useSymbolEarnings]) {
      expect(hook).not.toHaveBeenCalledWith('BBBB')
    }
  })

  it('holds company data back for a pinned instrument whose listing Saxo could not confirm', () => {
    stubQueries({ positions: [] })
    queries.useInstrumentDetails.mockReturnValue({ ...idle, data: undefined, error: new Error('saxo down') })
    renderWithProviders(<Research />, { route: '/research?symbol=WHAT&uic=9&assetType=Stock&tab=filings' })

    expect(screen.getByTestId('tab-refused')).toHaveTextContent(/could not confirm where this instrument is listed/i)
    expect(queries.useFilings).not.toHaveBeenCalledWith('WHAT')
    expect(queries.useFundamentals).not.toHaveBeenCalledWith('WHAT')
  })

  it('shows no US news for a fund listed in another currency', () => {
    stubQueries({ positions: [{ ...etfPosition, currency: 'EUR' }] })
    renderWithProviders(<Research />, { route: '/research?symbol=SPY&tab=news' })

    expect(queries.useCompanyNews).not.toHaveBeenCalledWith('SPY')
    expect(screen.getByTestId('tab-refused')).toHaveTextContent(/looked up by US ticker/i)
  })

  it('opens the company tabs once the lookup has settled, even without a match', () => {
    stubQueries({ positions: [] })
    queries.useInstrumentDetails.mockReturnValue({ ...idle, data: undefined })
    queries.useInstrumentSearch.mockReturnValue({ ...idle, data: [], isResolving: false })
    renderWithProviders(<Research />, { route: '/research?symbol=WHAT&tab=filings' })

    expect(screen.queryByTestId('tab-pending')).not.toBeInTheDocument()
    expect(queries.useFilings).toHaveBeenCalledWith('WHAT')
    expect(queries.useFundamentals).toHaveBeenCalledWith('WHAT')
  })

  it('shows no US company data for a listing in another currency', () => {
    queries.useInstrumentDetails.mockReturnValue({
      ...idle,
      data: { symbol: 'NVDA', description: 'NVIDIA on Xetra', exchange: 'XETR', currency: 'EUR', uic: 211 },
    })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA&tab=filings' })

    const tabs = within(screen.getByRole('tablist', { name: 'Instrument sections' })).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Overview', 'Activity', 'Notes and plan'])
    expect(screen.getByText(/listed outside the US/)).toBeInTheDocument()
    for (const hook of [queries.useFundamentals, queries.useStatements, queries.useFilings, queries.useInsiders, queries.useSymbolEarnings]) {
      expect(hook).not.toHaveBeenCalledWith('NVDA')
    }
  })

  it('leaves the news of a same-ticker US company out for a listing in another currency', async () => {
    queries.useInstrumentDetails.mockReturnValue({ ...idle, data: { symbol: 'NVDA', currency: 'EUR', uic: 211 } })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA&tab=news' })

    expect(queries.useCompanyNews).not.toHaveBeenCalledWith('NVDA')
    expect(screen.getByTestId('tab-refused')).toHaveTextContent(/looked up by US ticker/i)
  })

  it('still shows news for a fund', () => {
    stubQueries({ positions: [etfPosition] })
    renderWithProviders(<Research />, { route: '/research?symbol=SPY&tab=news' })

    expect(queries.useCompanyNews).toHaveBeenCalledWith('SPY')
  })

  it('holds the news back while the instrument is still being looked up', () => {
    stubQueries({ positions: [] })
    queries.useInstrumentSearch.mockReturnValue({ ...idle, data: [], isResolving: true })
    renderWithProviders(<Research />, { route: '/research?symbol=WHAT&tab=news' })

    expect(queries.useCompanyNews).not.toHaveBeenCalledWith('WHAT')
    expect(screen.getByTestId('tab-pending')).toBeInTheDocument()
  })

  it('trusts the held position currency over the instrument details', () => {
    stubQueries({ positions: [{ ...position, currency: 'EUR' }] })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByText(/listed outside the US/)).toBeInTheDocument()
    expect(queries.useFundamentals).not.toHaveBeenCalledWith('NVDA')
  })

  it('warns when a symbol cannot be resolved to a Saxo instrument', () => {
    stubQueries({ positions: [] })
    renderWithProviders(<Research />, { route: '/research?symbol=WHAT' })

    expect(screen.getByText(/Could not resolve WHAT/)).toBeInTheDocument()
  })

  it('offers a News tab, not a Market context tab', async () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })
    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }))
    expect(screen.getByRole('tab', { name: 'News' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Market context' })).not.toBeInTheDocument()
  })

  it('shows the news feed on the News tab', async () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })
    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }))
    await userEvent.click(screen.getByRole('tab', { name: 'News' }))
    expect(screen.getByText(/No recent news for NVDA/)).toBeInTheDocument()
  })

  it('collapses the news feed back to ten items when the symbol changes', async () => {
    const items = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      headline: `Headline ${i}`,
      url: `https://example.com/${i}`,
      source: 'Wire',
      datetime: 1_760_000_000 - i * 60,
    }))
    queries.useCompanyNews.mockReturnValue({ ...idle, data: { available: true, items } })
    queries.useWatchlists.mockReturnValue({ ...idle, data: [{ id: 1, name: 'Watching', items: [{ id: 9, symbol: 'AAPL', uic: 265598, asset_type: 'Stock' }] }] })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA&tab=news' })
    const links = () => screen.getAllByRole('link', { name: /^Headline/ })

    expect(links()).toHaveLength(10)
    await userEvent.click(screen.getByRole('button', { name: /Show more/ }))
    expect(links()).toHaveLength(20)

    await userEvent.click(screen.getByRole('button', { name: /^AAPL/ }))
    expect(links()).toHaveLength(10)
  })

  it('opens the Earnings tab on Quarterly again after the symbol changes', async () => {
    queries.useSymbolEarnings.mockReturnValue({
      ...idle,
      data: {
        available: true,
        next: null,
        history: [{ date: '2026-06-30', quarter: 2, year: 2026, eps_actual: 1.6, eps_estimate: 1.5, eps_surprise_pct: 6 }],
      },
    })
    queries.useWatchlists.mockReturnValue({ ...idle, data: [{ id: 1, name: 'Watching', items: [{ id: 9, symbol: 'AAPL', uic: 265598, asset_type: 'Stock' }] }] })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA&tab=earnings' })

    await userEvent.click(screen.getByRole('button', { name: 'Annual' }))
    expect(screen.getByRole('button', { name: 'Annual' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: /^AAPL/ }))

    expect(screen.getByRole('button', { name: 'Quarterly' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('falls back to Overview for the retired ?tab=market link', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA&tab=market' })
    expect(screen.getByTestId('answer-you')).toBeInTheDocument()
  })

  it('records the viewed symbol as recent', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })
    expect(JSON.parse(localStorage.getItem('saxodash:recent-symbols'))).toContain('NVDA')
  })

  it('draws the thesis target and the saved lines on the chart', () => {
    showAdvanced()
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByTestId('price-line-target')).toBeInTheDocument()
    expect(screen.getByTestId('price-line-7')).toBeInTheDocument()
    expect(queries.usePriceLines).toHaveBeenCalledWith(211, 'Stock')
  })

  it('saves an edited freeform-line label typed in the compact chart panel, not just opens the editor', () => {
    showAdvanced()
    const updateMutate = vi.fn()
    queries.usePriceLineMutations.mockReturnValue({
      create: { mutate: vi.fn() },
      update: { mutate: updateMutate },
      remove: { mutate: vi.fn() },
    })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    fireEvent.doubleClick(screen.getByTestId('price-hit-7'))
    const input = screen.getByLabelText('Line label')
    fireEvent.change(input, { target: { value: 'Support' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(updateMutate).toHaveBeenCalledWith({ id: 7, patch: { label: 'Support' } }, expect.anything())
  })
})

describe('Research panning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    stubQueries()
  })

  it('keeps the range statistics on the latest range while the chart is panned back', async () => {
    showAdvanced()
    renderWithProviders(<Research />, { route: '/research?symbol=AAPL' })
    await userEvent.click(screen.getByRole('button', { name: '1W' }))
    const plot = screen.getByTestId('price-scale').closest('svg').parentElement

    fireEvent.pointerDown(plot, { clientX: 200, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(plot, { clientX: 210, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(plot, { clientX: 500, clientY: 150, pointerId: 1 })
    fireEvent.pointerUp(plot, { clientX: 500, clientY: 150, pointerId: 1 })

    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeInTheDocument()
    expect(screen.getByText('1W high').parentElement).toHaveTextContent('143.00')
  })

  it('keeps the tab row inside its own scroller instead of widening the page', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    const row = screen.getByRole('tab', { name: 'Overview' }).parentElement
    expect(row).toHaveClass('overflow-x-auto', 'whitespace-nowrap')
    expect(screen.getByRole('tab', { name: 'Notes and plan' })).toHaveClass('shrink-0')
  })

  it('exposes the tabs as a tablist whose active tab owns a labelled tabpanel', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByRole('tablist', { name: 'Instrument sections' })).toBeInTheDocument()
    const chart = screen.getByRole('tab', { name: 'Overview' })
    expect(screen.getByRole('tab', { name: 'Fundamentals' })).toHaveAttribute('aria-selected', 'false')
    expect(chart).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', chart.id)
  })

  it.each(['', '&tab=financials', '&tab=news'])('keeps the watchlist rail on every tab (%s)', (tab) => {
    renderWithProviders(<Research />, { route: `/research?symbol=NVDA${tab}` })

    expect(screen.getByText('No lists yet. Create one to start tracking symbols.')).toBeInTheDocument()
  })

  it('keeps next earnings and who else owns it beside the chart on every tab', () => {
    queries.useSymbolEarnings.mockReturnValue({
      ...idle,
      data: { available: true, next: { date: '2026-11-19', session: 'amc', eps_estimate: 1.25, revenue_estimate: 54_000_000_000 }, history: [] },
    })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA&tab=news' })

    const panel = screen.getByRole('tabpanel')
    for (const name of ['Next earnings', 'Who else owns it']) {
      const heading = screen.getByRole('heading', { name })
      expect(heading).toBeInTheDocument()
      expect(panel).not.toContainElement(heading)
    }
  })
})

const company = {
  available: true,
  industry: 'Semiconductors',
  market_cap: 4_200_000,
  enterprise_value: 4_150_000,
  shares_outstanding: 24_000,
  free_float: 23_000,
  recommendation: { strong_buy: 20, buy: 30, hold: 5, sell: 1, strong_sell: 0, period: '2026-10-01' },
  recommendation_history: [],
}

describe('Research header and Overview on the new design', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    stubQueries()
  })

  it('all four groups render for an eligible US stock', () => {
    queries.useFundamentals.mockReturnValue({ ...idle, data: company })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    const tabs = within(screen.getByRole('tablist', { name: 'Instrument sections' })).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Overview', 'Fundamentals', 'Activity', 'Notes and plan'])
    expect(screen.getByRole('heading', { level: 1, name: 'NVIDIA Corporation' })).toBeInTheDocument()
    expect(screen.getByText('NVDA · Semiconductors · 4.2T market cap · You own it')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in Chart' })).toHaveAttribute(
      'href',
      '/charts?symbol=NVDA&uic=211&assetType=Stock',
    )
  })

  it('?tab=valuation opens Statistics inside the Fundamentals group', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA&tab=valuation' })

    expect(screen.getByRole('tab', { name: 'Fundamentals' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Statistics' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the position in the answer card on the Overview', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByTestId('answer-you')).toBeInTheDocument()
  })

  it('a foreign listing still shows the company-data note and hides company tabs', () => {
    queries.useInstrumentDetails.mockReturnValue({
      ...idle,
      data: { symbol: 'NVDA', description: 'NVIDIA on Xetra', exchange: 'XETR', currency: 'EUR', uic: 211 },
    })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    const tabs = within(screen.getByRole('tablist', { name: 'Instrument sections' })).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Overview', 'Activity', 'Notes and plan'])
    expect(screen.getByText(/listed outside the US/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Investment snapshot' })).not.toBeInTheDocument()
  })

  it('the Chart group keeps Performance and one ownership card, and leaves Thesis to Notes and reference cards to Statistics', async () => {
    queries.useFundamentals.mockReturnValue({ ...idle, data: company })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    for (const name of ['Performance', 'Who else owns it']) {
      expect(screen.getAllByRole('heading', { name })).toHaveLength(1)
    }
    for (const name of ['Thesis and risks', 'Range statistics', 'Capital structure', 'Ownership']) {
      expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('tab', { name: 'Fundamentals' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Statistics' }))
    expect(await screen.findByRole('heading', { name: 'Capital structure' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ownership' })).toBeInTheDocument()
  })

  it('summarises funds and Congress on the Overview and opens their tabs', async () => {
    queries.useOwnership.mockReturnValue({
      ...idle,
      data: { quarter: '2026-06-30', tracked: 88, filed: 80, stock: { owners: 40, new: 4, added: 11, trimmed: 22, sold_out: 2 }, funds: [] },
    })
    queries.useCongressOwnership.mockReturnValue({
      ...idle,
      data: { window_days: 365, stock: { buyers: 3, sellers: 1, holders: 5 }, members: [] },
    })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByRole('heading', { name: 'Who else owns it' })).toBeInTheDocument()
    expect(screen.getByText('40 of 88 tracked funds hold it')).toBeInTheDocument()
    expect(screen.getByText('3 bought · 1 sold · 5 holding')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Funds tab' }))
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Funds' })).toHaveAttribute('aria-selected', 'true')
  })

  it('asks nobody about fund or Congress ownership while the instrument is pending', () => {
    stubQueries({ positions: [] })
    queries.useInstrumentSearch.mockReturnValue({ ...idle, data: [], isResolving: true })
    renderWithProviders(<Research />, { route: '/research?symbol=WHAT' })

    expect(queries.useOwnership).not.toHaveBeenCalledWith('WHAT')
    expect(queries.useCongressOwnership).not.toHaveBeenCalledWith('WHAT')
    expect(screen.getByRole('heading', { name: 'Who else owns it' })).toBeInTheDocument()
  })

  it('asks nobody about ownership for a listing Saxo could not confirm', () => {
    stubQueries({ positions: [] })
    queries.useInstrumentDetails.mockReturnValue({ ...idle, data: undefined, error: new Error('saxo down') })
    renderWithProviders(<Research />, { route: '/research?symbol=WHAT&uic=9&assetType=Stock' })

    expect(queries.useOwnership).not.toHaveBeenCalledWith('WHAT')
    expect(queries.useCongressOwnership).not.toHaveBeenCalledWith('WHAT')
  })

  it('shows a dash rather than a made-up volume when the bar has none', () => {
    stubQueries({ chart: { data: bars.map((bar) => ({ ...bar, volume: undefined })), isLoading: false, error: null } })
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    const line = screen.getByText(/Vol —/)
    expect(line).not.toHaveTextContent(/NaN|0\.0M/)
  })
})

describe('Research chart first', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    stubQueries()
  })

  it('puts the chart above the verdict line and the section tabs', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    const chart = screen.getByRole('group', { name: 'Chart view' })
    const verdict = screen.getByTestId('answer-card')
    const tabs = screen.getByRole('tablist', { name: 'Instrument sections' })
    expect(chart.compareDocumentPosition(verdict) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(verdict.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('opens on the plain price line without the drawing tools', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getByRole('button', { name: 'Price' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'NVDA price chart' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Indicators' })).not.toBeInTheDocument()
  })

  it('switches to the advanced chart, and remembers the choice for the next visit', async () => {
    const { unmount } = renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Advanced chart' }))
    expect(screen.getByRole('button', { name: 'Advanced chart' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Indicators/ })).toBeInTheDocument()
    unmount()

    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })
    expect(screen.getByRole('button', { name: 'Advanced chart' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('leaves the Charts page chart style alone when Research switches view', async () => {
    localStorage.setItem('saxodash:chart-prefs', JSON.stringify({ type: 'bars' }))
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    await userEvent.click(screen.getByRole('button', { name: 'Advanced chart' }))
    expect(JSON.parse(localStorage.getItem('saxodash:chart-prefs')).type).toBe('bars')
  })

  it('shows the P/E once, under the price chart', () => {
    renderWithProviders(<Research />, { route: '/research?symbol=NVDA' })

    expect(screen.getAllByText('P/E')).toHaveLength(1)
    expect(within(screen.getByTestId('price-facts')).getByText('P/E')).toBeInTheDocument()
  })
})
