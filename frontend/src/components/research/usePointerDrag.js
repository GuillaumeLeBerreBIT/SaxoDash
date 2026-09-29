import { useRef, useState } from 'react'

import { DRAG_THRESHOLD } from '../../lib/chartGeometry'

export function usePointerDrag({ onStart, onDrag, threshold = DRAG_THRESHOLD }) {
  const drag = useRef(null)
  const moved = useRef(false)
  const [dragging, setDragging] = useState(false)

  const end = () => {
    drag.current = null
    setDragging(false)
  }

  const handlers = {
    onPointerDown: (event) => {
      moved.current = false
      if (event.button !== 0) return
      const context = onStart(event)
      if (context == null) return
      drag.current = { x: event.clientX, y: event.clientY, context, active: false }
    },
    onPointerMove: (event) => {
      const current = drag.current
      if (!current) return
      if (!current.active) {
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < threshold) return
        current.active = true
        current.x = event.clientX
        current.y = event.clientY
        moved.current = true
        setDragging(true)
        event.currentTarget.setPointerCapture?.(event.pointerId)
        return
      }
      onDrag({ dx: event.clientX - current.x, dy: event.clientY - current.y, context: current.context })
    },
    onPointerUp: end,
    onPointerCancel: end,
  }

  const consumeMoved = () => {
    const was = moved.current
    moved.current = false
    return was
  }

  return { handlers, dragging, consumeMoved }
}
