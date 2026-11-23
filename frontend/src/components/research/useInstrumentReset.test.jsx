import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { useInstrumentReset } from './useInstrumentReset'

const nyse = { uic: 501, assetType: 'Stock' }
const tsxv = { uic: 502, assetType: 'Stock' }

describe('useInstrumentReset', () => {
  it('leaves the state alone while the same Instrument stays open', () => {
    const reset = vi.fn()
    const { rerender } = renderHook(({ instrument }) => useInstrumentReset(instrument, reset), {
      initialProps: { instrument: nyse },
    })
    rerender({ instrument: { ...nyse } })
    expect(reset).not.toHaveBeenCalled()
  })

  it('resets once when another listing of the same ticker opens', () => {
    const reset = vi.fn()
    const { rerender, result } = renderHook(({ instrument }) => useInstrumentReset(instrument, reset), {
      initialProps: { instrument: nyse },
    })
    rerender({ instrument: tsxv })
    expect(reset).toHaveBeenCalledTimes(1)
    expect(result.current).toBe('502:Stock')
  })

  it('resets when the asset type alone changes', () => {
    const reset = vi.fn()
    const { rerender } = renderHook(({ instrument }) => useInstrumentReset(instrument, reset), {
      initialProps: { instrument: nyse },
    })
    rerender({ instrument: { uic: 501, assetType: 'Etf' } })
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
