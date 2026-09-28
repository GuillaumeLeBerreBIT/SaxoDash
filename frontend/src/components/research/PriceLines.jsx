import { useRef, useState } from 'react'

import { DRAG_THRESHOLD, PAD_R, PAD_T, svgY } from '../../lib/chartGeometry'
import { LINE_STROKES, badgePrice, edgeOf, parsePriceInput, roundPrice } from '../../lib/priceLines'

const TAG = { target: 'T', stop: 'S', free: '' }
const HIT_WIDTH = 10

const stop = (event) => event.stopPropagation()

function Badge({ line, price, y, width, selected }) {
  const color = LINE_STROKES[line.kind]

  return (
    <g data-testid={`price-badge-${line.id}`} pointerEvents="none">
      <rect
        x={width - PAD_R + 2}
        y={y - 8}
        width={PAD_R - 4}
        height={16}
        rx={2}
        fill={selected ? color : '#18181b'}
        stroke={color}
      />
      <text
        x={width - PAD_R + 6}
        y={y + 3.5}
        fill={selected ? '#09090b' : color}
        fontSize="10"
        fontFamily="Geist Mono"
      >
        {`${TAG[line.kind]} ${badgePrice(price)}`.trim()}
      </text>
    </g>
  )
}

function EdgeMarker({ line, edge, width, chartH }) {
  const color = LINE_STROKES[line.kind]
  const x = width - PAD_R + 8
  const y = edge === 'above' ? PAD_T + 6 : PAD_T + chartH - 6
  const points =
    edge === 'above'
      ? `${x - 4},${y + 3} ${x + 4},${y + 3} ${x},${y - 4}`
      : `${x - 4},${y - 3} ${x + 4},${y - 3} ${x},${y + 4}`

  return (
    <g data-testid={`price-edge-${line.id}`} pointerEvents="none">
      <polygon points={points} fill={color} />
      <text x={x + 8} y={y + 3.5} fill={color} fontSize="10" fontFamily="Geist Mono">
        {badgePrice(line.price)}
      </text>
    </g>
  )
}

function DraggableLine({ line, geometry, width, selected, onMove, onSelect }) {
  const [preview, setPreview] = useState(null)
  const [heldFrom, setHeldFrom] = useState(null)
  const drag = useRef(null)
  if (heldFrom != null && heldFrom !== line.price) {
    setHeldFrom(null)
    setPreview(null)
  }

  const edge = preview == null ? edgeOf(line.price, geometry) : null
  if (edge) return <EdgeMarker line={line} edge={edge} width={width} chartH={geometry.chartH} />

  const price = preview ?? line.price
  const y = geometry.scaleY(price)
  const x2 = width - PAD_R

  const cancel = () => {
    drag.current = null
    setHeldFrom(null)
    setPreview(null)
  }

  return (
    <g data-testid={`price-line-${line.id}`}>
      <line
        x1={0}
        x2={x2}
        y1={y}
        y2={y}
        stroke={LINE_STROKES[line.kind]}
        strokeWidth={selected ? 2 : 1}
        strokeDasharray={line.kind === 'free' ? undefined : '6 4'}
        pointerEvents="none"
      />
      <line
        data-testid={`price-hit-${line.id}`}
        x1={0}
        x2={x2}
        y1={y}
        y2={y}
        stroke="transparent"
        strokeWidth={HIT_WIDTH}
        style={{ cursor: 'ns-resize' }}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          drag.current = { startY: svgY(e), lineY: y, moved: false, price: line.price }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const offset = svgY(e) - drag.current.startY
          if (!drag.current.moved && Math.abs(offset) < DRAG_THRESHOLD) return
          drag.current.moved = true
          const next = roundPrice(geometry.priceAtY(drag.current.lineY + offset))
          drag.current.price = next
          setPreview(next)
        }}
        onPointerUp={() => {
          const { moved, price: dragged } = drag.current ?? {}
          if (!moved || dragged == null || dragged === line.price) return cancel()
          drag.current = null
          setHeldFrom(line.price)
          onMove(line, dragged)
        }}
        onPointerCancel={cancel}
        onClick={(e) => {
          e.stopPropagation()
          if (line.kind === 'free') onSelect(line.id)
        }}
        onDoubleClick={stop}
      />
      <Badge line={line} price={price} y={y} width={width} selected={selected} />
    </g>
  )
}

export default function PriceLines({ lines, geometry, width, selectedId, onMove, onSelect }) {
  return lines.map((line) => (
    <DraggableLine
      key={line.id}
      line={line}
      geometry={geometry}
      width={width}
      selected={line.id === selectedId}
      onMove={onMove}
      onSelect={onSelect}
    />
  ))
}

export function PriceEditor({ line, y, width, onCommit, onCancel }) {
  const [draft, setDraft] = useState(line.price.toFixed(2))
  const done = useRef(false)

  const close = (price) => {
    if (done.current) return
    done.current = true
    if (price == null || price === line.price) onCancel()
    else onCommit(line, price)
  }

  return (
    <input
      autoFocus
      aria-label="Line price"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') close(parsePriceInput(draft))
        if (e.key === 'Escape') close(null)
      }}
      onBlur={() => close(parsePriceInput(draft))}
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      className="absolute h-5 px-1 rounded bg-zinc-900 border border-blue-500/60 text-[10px] font-mono text-zinc-100 outline-none"
      style={{ left: width - PAD_R + 2, top: y - 10, width: PAD_R - 4 }}
    />
  )
}
