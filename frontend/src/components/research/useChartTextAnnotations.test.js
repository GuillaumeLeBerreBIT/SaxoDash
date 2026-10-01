import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import * as queries from '../../api/queries'
import { useChartTextAnnotations } from './useChartTextAnnotations'

vi.mock('../../api/queries', () => ({
  useTextAnnotations: vi.fn(),
  useTextAnnotationMutations: vi.fn(),
}))

const instrument = { uic: 211, assetType: 'Stock' }

describe('useChartTextAnnotations', () => {
  it('converts the saved annotations to numeric shape', () => {
    queries.useTextAnnotations.mockReturnValue({ data: [{ id: 1, bar_date: '2026-08-01', price: '100.00', text: 'Gap' }] })
    queries.useTextAnnotationMutations.mockReturnValue({
      create: { mutate: vi.fn() },
      update: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
    })

    const { result } = renderHook(() => useChartTextAnnotations({ symbol: 'NVDA', ...instrument }))

    expect(result.current.items).toEqual([{ id: 1, barDate: '2026-08-01', price: 100, text: 'Gap' }])
  })

  it('has no create function when the instrument is unresolved', () => {
    queries.useTextAnnotations.mockReturnValue({ data: [] })
    queries.useTextAnnotationMutations.mockReturnValue({
      create: { mutate: vi.fn() },
      update: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
    })

    const { result } = renderHook(() => useChartTextAnnotations({ symbol: 'NVDA', uic: undefined, assetType: undefined }))

    expect(result.current.create).toBeUndefined()
  })

  it('creates with a cents-rounded price', () => {
    queries.useTextAnnotations.mockReturnValue({ data: [] })
    const create = { mutate: vi.fn() }
    queries.useTextAnnotationMutations.mockReturnValue({ create, update: { mutate: vi.fn() }, remove: { mutate: vi.fn() } })

    const { result } = renderHook(() => useChartTextAnnotations({ symbol: 'NVDA', ...instrument }))
    result.current.create({ barDate: '2026-08-01', price: 100.456, text: 'Gap' })

    expect(create.mutate).toHaveBeenCalledWith(
      { barDate: '2026-08-01', price: '100.46', text: 'Gap' },
      expect.any(Object),
    )
  })

  it('tracks a save failure until the symbol changes', () => {
    queries.useTextAnnotations.mockReturnValue({ data: [] })
    const remove = { mutate: (id, opts) => opts.onError() }
    queries.useTextAnnotationMutations.mockReturnValue({ create: { mutate: vi.fn() }, update: { mutate: vi.fn() }, remove })

    const { result, rerender } = renderHook((props) => useChartTextAnnotations(props), {
      initialProps: { symbol: 'NVDA', ...instrument },
    })
    result.current.remove({ id: 1 })
    rerender({ symbol: 'NVDA', ...instrument })
    expect(result.current.saveFailed).toBe(true)

    rerender({ symbol: 'AAPL', ...instrument })
    expect(result.current.saveFailed).toBe(false)
  })
})
