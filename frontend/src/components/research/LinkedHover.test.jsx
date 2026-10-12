import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { LinkedHoverProvider, useLinkedHover } from './LinkedHover'

const wrapper = (enabled) =>
  function Wrapper({ children }) {
    return <LinkedHoverProvider enabled={enabled}>{children}</LinkedHoverProvider>
  }

describe('LinkedHover', () => {
  it('is absent outside a provider', () => {
    expect(renderHook(useLinkedHover).result.current).toBeNull()
  })

  it('is absent while linking is off', () => {
    expect(renderHook(useLinkedHover, { wrapper: wrapper(false) }).result.current).toBeNull()
  })

  it('shares a hovered date while linking is on', () => {
    const { result } = renderHook(useLinkedHover, { wrapper: wrapper(true) })
    expect(result.current.date).toBeNull()
    act(() => result.current.setDate('2026-08-10'))
    expect(result.current.date).toBe('2026-08-10')
  })
})
