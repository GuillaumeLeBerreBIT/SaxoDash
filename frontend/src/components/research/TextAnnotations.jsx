import { useRef, useState } from 'react'

import { indexFromPointer, svgY } from '../../lib/chartGeometry'
import { CATEGORY_AXIS_TEXT } from '../../lib/charts'
import { roundPrice } from '../../lib/priceLines'

const HIT_RADIUS = 10

const stop = (event) => event.stopPropagation()

function Note({ item, geometry, data, selected, onSelect, onMove, onEdit }) {
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
        fill={selected ? '#e4e4e7' : CATEGORY_AXIS_TEXT}
        fontSize="10"
        fontFamily="Geist Mono"
        pointerEvents="none"
      >
        {item.text}
      </text>
      <circle cx={x} cy={y} r={2.5} fill={CATEGORY_AXIS_TEXT} pointerEvents="none" />
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
      className="absolute h-6 px-1.5 rounded bg-zinc-900 border border-blue-500/60 text-[10px] font-mono text-zinc-100 outline-none"
      style={{ left: x, top: y - 12, width: 160 }}
    />
  )
}
