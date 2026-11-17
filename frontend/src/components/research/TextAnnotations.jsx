import { useRef, useState } from 'react'

import { indexFromPointer, svgY } from '../../lib/chartGeometry'
import { annotationKeyCommand, NUDGE_KEYS, nudgePoint, showsKeyboardFocus } from '../../lib/chartKeys'
import { fmtDate } from '../../lib/format'
import { badgePrice, roundPrice } from '../../lib/priceLines'
import { useChartColors } from '../../theme/useChartColors'

const HIT_RADIUS = 10

const stop = (event) => event.stopPropagation()

function Note({ item, geometry, data, selected, onSelect, onMove, onEdit }) {
  const c = useChartColors()
  const [preview, setPreview] = useState(null)
  const [focused, setFocused] = useState(false)
  const drag = useRef(null)
  const keyed = useRef(false)
  const index = preview?.index ?? item.index
  const x = preview?.x ?? geometry.xAt(item.index)
  const y = preview?.y ?? geometry.scaleY(item.price)

  const cancel = () => {
    drag.current = null
    setPreview(null)
  }

  const save = (moved) => {
    cancel()
    if (moved == null) return
    onMove(item, { barDate: data[moved.index].date, price: roundPrice(geometry.priceAtY(moved.y)) })
  }

  const saveKeyed = () => {
    if (!keyed.current) return
    keyed.current = false
    save(preview)
  }

  return (
    <g data-testid={`text-annotation-${item.id}`}>
      <text
        x={x + 6}
        y={y}
        fill={selected || focused ? c.ink : c.axisCategory}
        fontSize="11"
        pointerEvents="none"
      >
        {item.text}
      </text>
      <circle cx={x} cy={y} r={focused ? 4 : 2.5} fill={c.axisCategory} pointerEvents="none" />
      <circle
        data-testid={`text-annotation-hit-${item.id}`}
        cx={x}
        cy={y}
        r={HIT_RADIUS}
        fill="transparent"
        style={{ cursor: 'move', outline: 'none' }}
        tabIndex={0}
        role="button"
        aria-label={`Note ${item.text}, ${fmtDate(data[Math.min(index, data.length - 1)]?.date)} at ${badgePrice(roundPrice(geometry.priceAtY(y)))}`}
        onFocus={(e) => {
          setFocused(showsKeyboardFocus(e.currentTarget))
          onSelect(item.id)
        }}
        onBlur={() => {
          setFocused(false)
          saveKeyed()
        }}
        onKeyDown={(e) => {
          const command = annotationKeyCommand(e)
          if (!command) return
          e.preventDefault()
          if (command.edit) return onEdit(item.id)
          keyed.current = true
          const next = nudgePoint({ index: Math.min(index, data.length - 1), y }, command, data.length)
          setPreview({ ...next, x: geometry.xAt(next.index) })
        }}
        onKeyUp={(e) => {
          if (NUDGE_KEYS.has(e.key)) saveKeyed()
        }}
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
          const moved = drag.current?.moved
          save(moved ? preview : null)
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
