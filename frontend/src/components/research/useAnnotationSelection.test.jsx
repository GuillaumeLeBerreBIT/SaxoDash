import { useLayoutEffect, useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'

import { useAnnotationSelection } from './useAnnotationSelection'

function Harness({ items, onDelete, apiRef }) {
  const containerRef = useRef(null)
  const selection = useAnnotationSelection({ containerRef, items, onDelete })
  useLayoutEffect(() => {
    apiRef.current = selection
  })
  return (
    <div ref={containerRef}>
      <input aria-label="elsewhere" />
    </div>
  )
}

const setup = (items, onDelete = vi.fn()) => {
  const apiRef = { current: null }
  const utils = render(<Harness items={items} onDelete={onDelete} apiRef={apiRef} />)
  return { ...utils, apiRef, onDelete }
}

describe('useAnnotationSelection', () => {
  it('starts with nothing selected', () => {
    const { apiRef } = setup([{ id: 1 }])
    expect(apiRef.current.selected).toBeNull()
  })

  it('selects and resolves the item by id', () => {
    const { apiRef } = setup([{ id: 1 }, { id: 2 }])
    act(() => apiRef.current.select(2))
    expect(apiRef.current.selected).toEqual({ id: 2 })
  })

  it('deletes the selected item on Delete and clears the selection', () => {
    const { apiRef, onDelete } = setup([{ id: 1 }])
    act(() => apiRef.current.select(1))

    const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })
    act(() => window.dispatchEvent(event))

    expect(onDelete).toHaveBeenCalledWith({ id: 1 })
    expect(apiRef.current.selected).toBeNull()
  })

  it('does not delete while a typing target has focus', () => {
    const { apiRef, onDelete, getByLabelText } = setup([{ id: 1 }])
    act(() => apiRef.current.select(1))
    getByLabelText('elsewhere').focus()

    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
    act(() => window.dispatchEvent(event))

    expect(onDelete).not.toHaveBeenCalled()
  })

  it('clears the selection on Escape', () => {
    const { apiRef } = setup([{ id: 1 }])
    act(() => apiRef.current.select(1))

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))

    expect(apiRef.current.selected).toBeNull()
  })

  it('clears the selection on a pointerdown outside the container', () => {
    const { apiRef } = setup([{ id: 1 }])
    act(() => apiRef.current.select(1))

    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))

    expect(apiRef.current.selected).toBeNull()
  })
})
