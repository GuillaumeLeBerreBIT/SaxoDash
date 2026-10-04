import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useNow } from './useNow'

describe('useNow', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-04T07:00:00Z') }))
  afterEach(() => vi.useRealTimers())

  it('moves forward on its interval', () => {
    const { result } = renderHook(() => useNow(60_000))
    expect(result.current.toISOString()).toBe('2026-10-04T07:00:00.000Z')
    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current.toISOString()).toBe('2026-10-04T07:01:00.000Z')
  })
})
