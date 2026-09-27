import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'
import { useChartLines } from './useChartLines'

const noteMutate = vi.fn()

describe('useChartLines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queries.useSymbolNoteMutation.mockReturnValue({ mutate: noteMutate })
  })

  it('draws the thesis levels from the note', () => {
    const { result } = renderHook(() =>
      useChartLines({ symbol: 'NVDA', note: { target_price: '250.00', stop_price: '180.50' } }),
    )

    expect(result.current.lines).toEqual([
      { id: 'target', kind: 'target', price: 250 },
      { id: 'stop', kind: 'stop', price: 180.5 },
    ])
  })

  it('saves a moved target or stop onto the note', () => {
    const { result } = renderHook(() =>
      useChartLines({ symbol: 'NVDA', note: { target_price: '250.00', stop_price: '180.50' } }),
    )

    act(() => result.current.move(result.current.lines[0], 262.004))
    act(() => result.current.move(result.current.lines[1], 175))

    expect(noteMutate).toHaveBeenNthCalledWith(1, { target_price: '262.00' }, expect.any(Object))
    expect(noteMutate).toHaveBeenNthCalledWith(2, { stop_price: '175.00' }, expect.any(Object))
  })

  it('reports a failed save for the symbol it happened on only', () => {
    noteMutate.mockImplementation((_, { onError }) => onError(new Error('boom')))
    const { result, rerender } = renderHook((props) => useChartLines(props), {
      initialProps: { symbol: 'NVDA', note: { target_price: '250.00' } },
    })

    act(() => result.current.move(result.current.lines[0], 240))
    expect(result.current.saveFailed).toBe(true)

    rerender({ symbol: 'MSFT', note: {} })
    expect(result.current.saveFailed).toBe(false)
  })

  it('clears the failure once a save succeeds', () => {
    noteMutate.mockImplementationOnce((_, { onError }) => onError(new Error('boom')))
    noteMutate.mockImplementationOnce((_, { onSuccess }) => onSuccess())
    const { result } = renderHook(() => useChartLines({ symbol: 'NVDA', note: { target_price: '250.00' } }))

    act(() => result.current.move(result.current.lines[0], 240))
    act(() => result.current.move(result.current.lines[0], 241))

    expect(result.current.saveFailed).toBe(false)
  })
})
