import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { LATEST_TIME_VIEW } from '../../lib/timeWindow'
import { useChartData } from './useChartData'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const bars = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 1_000_000,
}))
const idle = { data: undefined, isLoading: false, error: null }
const instrument = { uic: 211, assetType: 'Stock' }

function stub() {
  queries.useChart.mockReturnValue({ data: bars, isLoading: false, error: null })
  queries.useInstrumentDetails.mockReturnValue({ ...idle, data: { currency: 'USD' } })
  queries.useSymbolEarnings.mockReturnValue({ ...idle, data: { available: false } })
  queries.useSymbolNote.mockReturnValue({ ...idle, data: null })
  queries.useNoteLevelMutation.mockReturnValue({ mutate: vi.fn() })
  queries.usePriceLines.mockReturnValue({ ...idle, data: [] })
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
  queries.useQuotes.mockReturnValue({ ...idle, data: [{ uic: 211, price: 875.4, change_pct: 1.42 }] })
}

const render = (props = {}) =>
  renderHook(() => useChartData({ symbol: 'NVDA', instrument, range: '1M', ...props }))

describe('useChartData company data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stub()
  })

  it('asks for the earnings of a US-dollar listing', () => {
    const { result } = render()

    expect(queries.useSymbolEarnings).toHaveBeenLastCalledWith('NVDA')
    expect(result.current.companyData).toBe('eligible')
  })

  it('asks for no earnings when the listing is in another currency', () => {
    queries.useInstrumentDetails.mockReturnValue({ ...idle, data: { currency: 'EUR' } })
    const { result } = render()

    expect(queries.useSymbolEarnings).toHaveBeenLastCalledWith('')
    expect(result.current.companyData).toBe('foreign')
  })

  it('trusts the held position over the instrument details for the currency', () => {
    const { result } = render({ position: { currency: 'EUR' } })

    expect(result.current.companyData).toBe('foreign')
  })

  it('asks for no earnings while the instrument is still being resolved', () => {
    const { result } = render({ instrument: null, resolving: true })

    expect(queries.useSymbolEarnings).toHaveBeenLastCalledWith('')
    expect(result.current.companyData).toBe('pending')
  })

  it('waits for the currency of a resolved instrument whose details are loading', () => {
    queries.useInstrumentDetails.mockReturnValue({ ...idle, isLoading: true })
    const { result } = render()

    expect(queries.useSymbolEarnings).toHaveBeenLastCalledWith('')
    expect(result.current.companyData).toBe('pending')
  })

  it('does not wait for details when the instrument already carries its currency', () => {
    queries.useInstrumentDetails.mockReturnValue({ ...idle, isLoading: true })
    const { result } = render({ instrument: { ...instrument, currency: 'USD' } })

    expect(result.current.companyData).toBe('eligible')
    expect(result.current.currency).toBe('USD')
  })

  it('does not vouch for a resolved instrument whose details failed', () => {
    queries.useInstrumentDetails.mockReturnValue({ ...idle, data: undefined, error: new Error('saxo down') })
    const { result } = render()

    expect(queries.useSymbolEarnings).toHaveBeenLastCalledWith('')
    expect(result.current.companyData).toBe('unverified')
  })

  it('asks for nothing about an unresolved symbol where an instrument is required', () => {
    queries.useInstrumentDetails.mockReturnValue({ ...idle, data: undefined })
    const { result } = render({ instrument: null, requireInstrument: true })

    expect(queries.useSymbolEarnings).toHaveBeenLastCalledWith('')
    expect(result.current.companyData).toBe('unverified')
  })

  it('asks for no earnings for a fund', () => {
    const { result } = render({ instrument: { uic: 300, assetType: 'Etf' } })

    expect(queries.useSymbolEarnings).toHaveBeenLastCalledWith('')
    expect(result.current.companyData).toBe('fund')
  })
})

describe('useChartData linked window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stub()
  })

  it('shows its own time view when it is not following', () => {
    const { result } = render({ timeView: { offset: 5, barCount: 10 } })
    expect(result.current.bars.map((b) => b.date)[0]).toBe('2026-08-16')
    expect(result.current.timeView).toEqual({ offset: 5, barCount: 10 })
  })

  it('shows the followed dates instead of its own time view', () => {
    const { result } = render({
      timeView: LATEST_TIME_VIEW,
      followDates: { from: '2026-08-05', to: '2026-08-14' },
    })
    expect(result.current.bars.map((b) => b.date)).toEqual(
      bars.slice(4, 14).map((b) => b.date),
    )
    expect(result.current.timeView).toEqual({ offset: 16, barCount: 10 })
  })

  it('exposes every fetched bar', () => {
    const { result } = render()
    expect(result.current.allBars).toHaveLength(30)
  })
})
