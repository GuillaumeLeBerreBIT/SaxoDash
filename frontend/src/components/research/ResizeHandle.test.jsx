import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import ResizeHandle from './ResizeHandle'

const limits = { min: 200, max: 500, initial: 300 }

const renderHandle = (props = {}) => {
  const onResize = vi.fn()
  render(<ResizeHandle label="Sidebar width" orientation="vertical" value={300} limits={limits} onResize={onResize} {...props} />)
  return { onResize, handle: screen.getByRole('separator', { name: 'Sidebar width' }) }
}

describe('ResizeHandle', () => {
  it('describes itself as a focusable separator with its range', () => {
    const { handle } = renderHandle()

    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle).toHaveAttribute('aria-valuenow', '300')
    expect(handle).toHaveAttribute('aria-valuemin', '200')
    expect(handle).toHaveAttribute('aria-valuemax', '500')
    expect(handle).toHaveAttribute('tabindex', '0')
  })

  it('follows a pointer drag, clamped to the limits', () => {
    const { onResize, handle } = renderHandle()

    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 150, clientY: 0, pointerId: 1 })
    expect(onResize).toHaveBeenLastCalledWith(350)

    fireEvent.pointerMove(handle, { clientX: 900, clientY: 0, pointerId: 1 })
    expect(onResize).toHaveBeenLastCalledWith(500)

    fireEvent.pointerUp(handle, { pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 120, clientY: 0, pointerId: 1 })
    expect(onResize).toHaveBeenCalledTimes(2)
  })

  it('grows the other way when inverted, as a sidebar on the right does', () => {
    const { onResize, handle } = renderHandle({ invert: true })

    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 60, clientY: 0, pointerId: 1 })

    expect(onResize).toHaveBeenLastCalledWith(340)
  })

  it('reads the vertical pointer position for a horizontal handle', () => {
    const { onResize, handle } = renderHandle({ orientation: 'horizontal' })

    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 500, clientY: 130, pointerId: 1 })

    expect(onResize).toHaveBeenLastCalledWith(330)
  })

  it('steps with the arrow keys and jumps with Home and End', () => {
    const { onResize, handle } = renderHandle()

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onResize).toHaveBeenLastCalledWith(316)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onResize).toHaveBeenLastCalledWith(284)
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(onResize).toHaveBeenLastCalledWith(200)
    fireEvent.keyDown(handle, { key: 'End' })
    expect(onResize).toHaveBeenLastCalledWith(500)
  })

  it('goes back to the initial size on a double-click', () => {
    const { onResize, handle } = renderHandle({ value: 420 })

    fireEvent.doubleClick(handle)

    expect(onResize).toHaveBeenLastCalledWith(300)
  })
})
