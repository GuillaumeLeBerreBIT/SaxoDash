import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import * as queries from '../../api/queries'
import { useSavedChartZones } from './useSavedChartZones'

vi.mock('../../api/queries', () => ({
  useChartZones: vi.fn(),
  useChartZoneMutations: vi.fn(),
}))

const instrument = { uic: 211, assetType: 'Stock' }

describe('useSavedChartZones', () => {
  it('converts the saved zones to numeric shape', () => {
    queries.useChartZones.mockReturnValue({
      data: [{ id: 1, start_bar_date: '2026-08-01', end_bar_date: '2026-08-10', low_price: '168.00', high_price: '175.50', label: '' }],
    })
    queries.useChartZoneMutations.mockReturnValue({ create: { mutate: vi.fn() }, remove: { mutate: vi.fn() } })

    const { result } = renderHook(() => useSavedChartZones({ symbol: 'NVDA', ...instrument }))

    expect(result.current.zones).toEqual([
      { id: 1, start: '2026-08-01', end: '2026-08-10', low: 168, high: 175.5, label: '' },
    ])
  })

  it('has no create function when the instrument is unresolved', () => {
    queries.useChartZones.mockReturnValue({ data: [] })
    queries.useChartZoneMutations.mockReturnValue({ create: { mutate: vi.fn() }, remove: { mutate: vi.fn() } })

    const { result } = renderHook(() => useSavedChartZones({ symbol: 'NVDA', uic: undefined, assetType: undefined }))

    expect(result.current.create).toBeUndefined()
  })

  it('creates a zone ordered by date and price, with cents-rounded bounds', () => {
    queries.useChartZones.mockReturnValue({ data: [] })
    const create = { mutate: vi.fn() }
    queries.useChartZoneMutations.mockReturnValue({ create, remove: { mutate: vi.fn() } })

    const { result } = renderHook(() => useSavedChartZones({ symbol: 'NVDA', ...instrument }))
    result.current.create({ barDate: '2026-08-10', price: 175.456 }, { barDate: '2026-08-01', price: 168 })

    expect(create.mutate).toHaveBeenCalledWith(
      { startBarDate: '2026-08-01', endBarDate: '2026-08-10', lowPrice: '168.00', highPrice: '175.46' },
      expect.any(Object),
    )
  })

  it('removes a zone by its id', () => {
    queries.useChartZones.mockReturnValue({ data: [] })
    const remove = { mutate: vi.fn() }
    queries.useChartZoneMutations.mockReturnValue({ create: { mutate: vi.fn() }, remove })

    const { result } = renderHook(() => useSavedChartZones({ symbol: 'NVDA', ...instrument }))
    result.current.remove({ id: 9 })

    expect(remove.mutate).toHaveBeenCalledWith(9, expect.any(Object))
  })
})
