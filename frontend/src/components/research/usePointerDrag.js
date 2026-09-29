import { useRef, useState } from 'react'

import { DRAG_THRESHOLD } from '../../lib/chartGeometry'

export function usePointerDrag({ onStart, onDrag }) {
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
      const dx = event.clientX - current.x
      const dy = event.clientY - current.y
      if (!current.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        current.active = true
        moved.current = true
        setDragging(true)
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }
      onDrag({ dx, dy, context: current.context })
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
