import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { usePaged } from './usePaged'

const items = Array.from({ length: 60 }, (_, index) => index)

describe('usePaged', () => {
  it('shows the first page and grows by a step', () => {
    const { result } = renderHook(() => usePaged(items, 25))
    expect(result.current.rows).toHaveLength(25)
    expect(result.current.total).toBe(60)
    act(() => result.current.more())
    expect(result.current.rows).toHaveLength(50)
    act(() => result.current.more())
    expect(result.current.rows).toHaveLength(60)
    expect(result.current.more).toBeNull()
  })

  it('has nothing more to show for a short or missing list', () => {
    expect(renderHook(() => usePaged([1, 2], 25)).result.current.more).toBeNull()
    const empty = renderHook(() => usePaged(undefined)).result.current
    expect([empty.rows, empty.shown, empty.total, empty.more]).toEqual([[], 0, 0, null])
  })
})
