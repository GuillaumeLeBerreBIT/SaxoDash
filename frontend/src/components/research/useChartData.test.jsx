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
