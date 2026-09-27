import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'
import { useChartLines } from './useChartLines'

const noteMutate = vi.fn()
const createMutate = vi.fn()
const updateMutate = vi.fn()
const removeMutate = vi.fn()

const instrument = { symbol: 'NVDA', uic: 211, assetType: 'Stock' }

describe('useChartLines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queries.useNoteLevelMutation.mockReturnValue({ mutate: noteMutate })
    queries.usePriceLines.mockReturnValue({ data: [{ id: 7, uic: 211, asset_type: 'Stock', price: '95.50' }] })
    queries.usePriceLineMutations.mockReturnValue({
      create: { mutate: createMutate },
      update: { mutate: updateMutate },
      remove: { mutate: removeMutate },
    })
  })

  it('draws the thesis levels and the saved lines for the instrument', () => {
    const { result } = renderHook(() =>
      useChartLines({ ...instrument, note: { target_price: '250.00', stop_price: '180.50' } }),
    )

    expect(queries.usePriceLines).toHaveBeenCalledWith(211, 'Stock')
    expect(result.current.lines).toEqual([
      { id: 'target', kind: 'target', price: 250 },
      { id: 'stop', kind: 'stop', price: 180.5 },
      { id: 7, kind: 'free', price: 95.5 },
    ])
  })

  it('saves a moved target or stop onto the note', () => {
    const { result } = renderHook(() =>
      useChartLines({ ...instrument, note: { target_price: '250.00', stop_price: '180.50' } }),
    )

    act(() => result.current.move(result.current.lines[0], 262.004))
    act(() => result.current.move(result.current.lines[1], 175))

    expect(noteMutate).toHaveBeenNthCalledWith(1, { target_price: '262.00' }, expect.any(Object))
    expect(noteMutate).toHaveBeenNthCalledWith(2, { stop_price: '175.00' }, expect.any(Object))
    expect(updateMutate).not.toHaveBeenCalled()
  })

  it('saves a moved freeform line as that line', () => {
    const { result } = renderHook(() => useChartLines({ ...instrument, note: {} }))

    act(() => result.current.move(result.current.lines[0], 96.125))

    expect(updateMutate).toHaveBeenCalledWith({ id: 7, price: '96.13' }, expect.any(Object))
    expect(noteMutate).not.toHaveBeenCalled()
  })

  it('creates and removes freeform lines', () => {
    const { result } = renderHook(() => useChartLines({ ...instrument, note: {} }))

    act(() => result.current.create(101))
    act(() => result.current.remove(result.current.lines[0]))

    expect(createMutate).toHaveBeenCalledWith({ price: '101.00' }, expect.any(Object))
    expect(removeMutate).toHaveBeenCalledWith(7, expect.any(Object))
  })

  it('cannot create a line before the instrument is resolved', () => {
    queries.usePriceLines.mockReturnValue({ data: undefined })
    const { result } = renderHook(() =>
      useChartLines({ symbol: 'NVDA', uic: undefined, assetType: undefined, note: { target_price: '250.00' } }),
    )

    expect(result.current.create).toBeUndefined()
    expect(result.current.lines).toEqual([{ id: 'target', kind: 'target', price: 250 }])
  })

  it('reports a failed save for the symbol it happened on only', () => {
    updateMutate.mockImplementation((_, { onError }) => onError(new Error('boom')))
    const { result, rerender } = renderHook((props) => useChartLines(props), {
      initialProps: { ...instrument, note: {} },
    })

    act(() => result.current.move(result.current.lines[0], 90))
    expect(result.current.saveFailed).toBe(true)

    rerender({ symbol: 'MSFT', uic: 5, assetType: 'Stock', note: {} })
    expect(result.current.saveFailed).toBe(false)
  })

  it('clears the failure once a save succeeds', () => {
    noteMutate.mockImplementationOnce((_, { onError }) => onError(new Error('boom')))
    noteMutate.mockImplementationOnce((_, { onSuccess }) => onSuccess())
    const { result } = renderHook(() => useChartLines({ ...instrument, note: { target_price: '250.00' } }))

    act(() => result.current.move(result.current.lines[0], 240))
    act(() => result.current.move(result.current.lines[0], 241))

    expect(result.current.saveFailed).toBe(false)
  })
})
