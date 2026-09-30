import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'

import { useAnnotationSelection } from './useAnnotationSelection'

function Harness({ items, onDelete, api }) {
  const containerRef = useRef(null)
  const selection = useAnnotationSelection({ containerRef, items, onDelete })
  api.current = selection
  return (
    <div ref={containerRef}>
      <input aria-label="elsewhere" />
    </div>
  )
}

const setup = (items, onDelete = vi.fn()) => {
  const api = { current: null }
  const utils = render(<Harness items={items} onDelete={onDelete} api={api} />)
  return { ...utils, api, onDelete }
}

describe('useAnnotationSelection', () => {
  it('starts with nothing selected', () => {
    const { api } = setup([{ id: 1 }])
    expect(api.current.selected).toBeNull()
  })

  it('selects and resolves the item by id', () => {
    const { api } = setup([{ id: 1 }, { id: 2 }])
    act(() => api.current.select(2))
    expect(api.current.selected).toEqual({ id: 2 })
  })

  it('deletes the selected item on Delete and clears the selection', () => {
    const { api, onDelete } = setup([{ id: 1 }])
    act(() => api.current.select(1))

    const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })
    act(() => window.dispatchEvent(event))

    expect(onDelete).toHaveBeenCalledWith({ id: 1 })
    expect(api.current.selected).toBeNull()
  })

  it('does not delete while a typing target has focus', () => {
    const { api, onDelete, getByLabelText } = setup([{ id: 1 }])
    act(() => api.current.select(1))
    getByLabelText('elsewhere').focus()

    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
    act(() => window.dispatchEvent(event))

    expect(onDelete).not.toHaveBeenCalled()
  })

  it('clears the selection on Escape', () => {
    const { api } = setup([{ id: 1 }])
    act(() => api.current.select(1))

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))

    expect(api.current.selected).toBeNull()
  })

  it('clears the selection on a pointerdown outside the container', () => {
    const { api } = setup([{ id: 1 }])
    act(() => api.current.select(1))

    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))

    expect(api.current.selected).toBeNull()
  })
})
