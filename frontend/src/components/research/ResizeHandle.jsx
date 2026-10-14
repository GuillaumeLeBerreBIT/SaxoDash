import { useRef } from 'react'

import { RESIZE_STEP, clampSize } from '../../lib/railLayout'

const GROW_KEYS = {
  vertical: { ArrowRight: 1, ArrowLeft: -1 },
  horizontal: { ArrowDown: 1, ArrowUp: -1 },
}

export default function ResizeHandle({ label, orientation, value, limits, onResize, invert = false, className = '', style }) {
  const drag = useRef(null)
  const vertical = orientation === 'vertical'
  const direction = invert ? -1 : 1
  const position = (event) => (vertical ? event.clientX : event.clientY)
  const resize = (next) => onResize(clampSize(next, limits))

  const onKeyDown = (event) => {
    const grow = GROW_KEYS[orientation][event.key]
    if (grow) {
      event.preventDefault()
      resize(value + grow * direction * RESIZE_STEP)
    } else if (event.key === 'Home') {
      event.preventDefault()
      resize(limits.min)
    } else if (event.key === 'End') {
      event.preventDefault()
      resize(limits.max)
    }
  }

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={value}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      tabIndex={0}
      style={style}
      title={`${label}: drag to resize, double-click to reset`}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture?.(event.pointerId)
        drag.current = { from: position(event), start: value }
      }}
      onPointerMove={(event) => {
        if (!drag.current) return
        resize(drag.current.start + (position(event) - drag.current.from) * direction)
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onDoubleClick={() => resize(limits.initial)}
      onKeyDown={onKeyDown}
      className={`group touch-none select-none outline-none ${vertical ? 'cursor-col-resize' : 'cursor-row-resize'} ${className}`}
    >
      <span
        className={`block rounded-full bg-white/[0.06] transition-colors group-hover:bg-blue-500/60 group-focus-visible:bg-blue-500 ${
          vertical ? 'mx-auto h-full w-0.5' : 'my-auto h-0.5 w-full'
        }`}
      />
    </div>
  )
}
