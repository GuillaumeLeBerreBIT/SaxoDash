import { useRef, useState } from 'react'

import { indexFromPointer, svgY } from '../../lib/chartGeometry'
import { roundPrice } from '../../lib/priceLines'
import { useChartColors } from '../../theme/useChartColors'

const HIT_RADIUS = 10

const stop = (event) => event.stopPropagation()

function Note({ item, geometry, data, selected, onSelect, onMove, onEdit }) {
  const c = useChartColors()
  const [preview, setPreview] = useState(null)
  const drag = useRef(null)
  const x = preview?.x ?? geometry.xAt(item.index)
  const y = preview?.y ?? geometry.scaleY(item.price)

  const cancel = () => {
    drag.current = null
    setPreview(null)
  }

  return (
    <g data-testid={`text-annotation-${item.id}`}>
      <text
        x={x + 6}
        y={y}
        fill={selected ? c.ink : c.axisCategory}
        fontSize="10"
        pointerEvents="none"
      >
        {item.text}
      </text>
      <circle cx={x} cy={y} r={2.5} fill={c.axisCategory} pointerEvents="none" />
      <circle
        data-testid={`text-annotation-hit-${item.id}`}
        cx={x}
        cy={y}
        r={HIT_RADIUS}
        fill="transparent"
        style={{ cursor: 'move' }}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          drag.current = { moved: false }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          drag.current.moved = true
          const index = indexFromPointer(e, geometry.slot, data.length)
          setPreview({ x: geometry.xAt(index), y: svgY(e), index })
        }}
        onPointerUp={() => {
          const current = drag.current
          cancel()
          if (!current?.moved || preview == null) return
          onMove(item, { barDate: data[preview.index].date, price: roundPrice(geometry.priceAtY(preview.y)) })
        }}
        onPointerCancel={cancel}
        onClick={(e) => {
          e.stopPropagation()
          if (!drag.current) onSelect(item.id)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onEdit(item.id)
        }}
      />
    </g>
  )
}

export default function TextAnnotations({ items, geometry, data, selectedId, onSelect, onMove, onEdit }) {
  return items.map((item) => (
    <Note
      key={item.id}
      item={item}
      geometry={geometry}
      data={data}
      selected={item.id === selectedId}
      onSelect={onSelect}
      onMove={onMove}
      onEdit={onEdit}
    />
  ))
}

export function TextAnnotationEditor({ text, x, y, onCommit, onCancel }) {
  const [draft, setDraft] = useState(text)
  const done = useRef(false)

  const close = (value) => {
    if (done.current) return
    done.current = true
    const trimmed = value?.trim()
    if (!trimmed) onCancel()
    else onCommit(trimmed)
  }

  return (
    <input
      autoFocus
      aria-label="Annotation text"
      value={draft}
      maxLength={200}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') close(draft)
        if (e.key === 'Escape') close(null)
      }}
      onBlur={() => close(draft)}
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      className="absolute h-6 px-1.5 rounded bg-raised border border-accent/60 text-[var(--fig-2xs)] text-ink outline-none"
      style={{ left: x, top: y - 12, width: 160 }}
    />
  )
}
