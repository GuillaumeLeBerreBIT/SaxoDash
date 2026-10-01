import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import * as queries from '../../api/queries'
import { useChartTrendLines } from './useChartTrendLines'

vi.mock('../../api/queries', () => ({
  useTrendLines: vi.fn(),
  useTrendLineMutations: vi.fn(),
}))

const instrument = { uic: 211, assetType: 'Stock' }

describe('useChartTrendLines', () => {
  it('converts the saved lines to numeric shape', () => {
    queries.useTrendLines.mockReturnValue({
      data: [{ id: 1, start_bar_date: '2026-08-01', start_price: '100.00', end_bar_date: '2026-08-10', end_price: '110.00', label: '' }],
    })
    queries.useTrendLineMutations.mockReturnValue({
      create: { mutate: vi.fn() },
      update: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
    })

    const { result } = renderHook(() => useChartTrendLines({ symbol: 'NVDA', ...instrument }))

    expect(result.current.lines).toEqual([
      { id: 1, start: { barDate: '2026-08-01', price: 100 }, end: { barDate: '2026-08-10', price: 110 }, label: '' },
    ])
  })

  it('has no create function when the instrument is unresolved', () => {
    queries.useTrendLines.mockReturnValue({ data: [] })
    queries.useTrendLineMutations.mockReturnValue({
      create: { mutate: vi.fn() },
      update: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
    })

    const { result } = renderHook(() => useChartTrendLines({ symbol: 'NVDA', uic: undefined, assetType: undefined }))

    expect(result.current.create).toBeUndefined()
  })

  it('creates with cents-rounded prices from both endpoints', () => {
    queries.useTrendLines.mockReturnValue({ data: [] })
    const create = { mutate: vi.fn() }
    queries.useTrendLineMutations.mockReturnValue({ create, update: { mutate: vi.fn() }, remove: { mutate: vi.fn() } })

    const { result } = renderHook(() => useChartTrendLines({ symbol: 'NVDA', ...instrument }))
    result.current.create({ barDate: '2026-08-01', price: 100.456 }, { barDate: '2026-08-10', price: 110 })

    expect(create.mutate).toHaveBeenCalledWith(
      { startBarDate: '2026-08-01', startPrice: '100.46', endBarDate: '2026-08-10', endPrice: '110.00' },
      expect.any(Object),
    )
  })

  it('tracks a save failure until the symbol changes', () => {
    queries.useTrendLines.mockReturnValue({ data: [] })
    const remove = { mutate: (id, opts) => opts.onError() }
    queries.useTrendLineMutations.mockReturnValue({ create: { mutate: vi.fn() }, update: { mutate: vi.fn() }, remove })

    const { result, rerender } = renderHook((props) => useChartTrendLines(props), {
      initialProps: { symbol: 'NVDA', ...instrument },
    })
    result.current.remove({ id: 1 })
    rerender({ symbol: 'NVDA', ...instrument })
    expect(result.current.saveFailed).toBe(true)

    rerender({ symbol: 'AAPL', ...instrument })
    expect(result.current.saveFailed).toBe(false)
  })
})
