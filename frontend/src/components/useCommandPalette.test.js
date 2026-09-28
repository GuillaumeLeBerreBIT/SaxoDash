import { describe, expect, it } from 'vitest'
import { act, fireEvent, renderHook } from '@testing-library/react'

import { useCommandPalette } from './useCommandPalette'

describe('useCommandPalette', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useCommandPalette())
    expect(result.current.open).toBe(false)
  })

  it('opens on Cmd+K and Ctrl+K', () => {
    const { result } = renderHook(() => useCommandPalette())
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(result.current.open).toBe(true)

    act(() => result.current.setOpen(false))
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })
    expect(result.current.open).toBe(true)
  })

  it('ignores a plain k', () => {
    const { result } = renderHook(() => useCommandPalette())
    fireEvent.keyDown(window, { key: 'k' })
    expect(result.current.open).toBe(false)
  })
})
