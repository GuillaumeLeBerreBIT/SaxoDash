import { useEffect, useRef, useState } from 'react'

import { COLS, moveTo, removePanel, resizeTo, snapTarget } from '../../lib/boards'
import BoardPanel from './BoardPanel'

const PHONE_MAX = 760
const EDIT_ROWS = 3
const DEFAULT_GAP = 12

const NUDGES = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

const readingOrder = (a, b) => a.y - b.y || a.x - b.x

function gridMetrics(grid) {
  const gap = parseFloat(getComputedStyle(grid).columnGap) || DEFAULT_GAP
  const colWidth = Math.max(1, (grid.clientWidth - (COLS - 1) * gap) / COLS)
  return { colWidth, gap }
}

function Guides() {
  return (
    <div aria-hidden="true" className="pointer-events-none hidden min-[760px]:grid grid-cols-12 gap-3 [grid-column:1/-1] [grid-row:1/-1]">
      {Array.from({ length: COLS }, (_, i) => (
        <i key={i} className="rounded-md bg-[color-mix(in_srgb,var(--sd-accent)_5%,transparent)]" />
      ))}
    </div>
  )
}

function DropZone({ target }) {
  return (
    <div
      data-testid="drop-zone"
      aria-hidden="true"
      style={{ gridColumn: `${target.x + 1} / span ${target.w}`, gridRow: `${target.y + 1} / span ${target.h}` }}
      className="pointer-events-none z-10 rounded-xl bg-[color-mix(in_srgb,var(--sd-accent)_16%,transparent)] outline-dashed outline-1 outline-accent"
    />
  )
}

export default function BoardGrid({ board, editing = false, onChange, onFollow }) {
  const gridRef = useRef(null)
  const [drag, setDrag] = useState(null)
  const liveDrag = useRef(null)

  useEffect(() => {
    if (!drag) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (liveDrag.current) liveDrag.current.cancelled = true
      setDrag(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drag])

  const startDrag = (mode) => (event, panel) => {
    if (!editing || window.innerWidth < PHONE_MAX || !gridRef.current) return
    event.preventDefault()
    const handle = event.currentTarget
    const metrics = gridMetrics(gridRef.current)
    const start = { x: event.clientX, y: event.clientY }
    handle.setPointerCapture?.(event.pointerId)
    const live = { target: panel, cancelled: false }
    liveDrag.current = live
    setDrag({ id: panel.id, mode, offset: { dx: 0, dy: 0 }, target: panel })

    const follow = (moveEvent) => {
      if (live.cancelled) return
      const delta = { dx: moveEvent.clientX - start.x, dy: moveEvent.clientY - start.y }
      live.target = snapTarget(mode, panel, delta, metrics)
      setDrag({ id: panel.id, mode, offset: mode === 'move' ? delta : null, target: live.target })
    }
    const finish = (commit) => () => {
      handle.removeEventListener('pointermove', follow)
      handle.removeEventListener('pointerup', drop)
      handle.removeEventListener('pointercancel', abandon)
      if (liveDrag.current === live) liveDrag.current = null
      setDrag(null)
      if (!commit || live.cancelled) return
      const { target } = live
      onChange(mode === 'move' ? moveTo(board, panel.id, target.x, target.y) : resizeTo(board, panel.id, target.w, target.h))
    }
    const drop = finish(true)
    const abandon = finish(false)
    handle.addEventListener('pointermove', follow)
    handle.addEventListener('pointerup', drop)
    handle.addEventListener('pointercancel', abandon)
  }

  const nudge = (event, panel, mode) => {
    const step = NUDGES[event.key]
    if (!step) return
    event.preventDefault()
    const [dx, dy] = step
    onChange(mode === 'move' ? moveTo(board, panel.id, panel.x + dx, panel.y + dy) : resizeTo(board, panel.id, panel.w + dx, panel.h + dy))
  }

  const rows = Math.max(1, ...board.panels.map((p) => p.y + p.h), drag ? drag.target.y + drag.target.h : 0)
  const ordered = [...board.panels].sort(readingOrder)

  return (
    <div
      ref={gridRef}
      data-testid="board-grid"
      style={{ '--rows': rows + (editing ? EDIT_ROWS : 0) }}
      className="grid grid-cols-1 gap-3 min-[760px]:grid-cols-12 min-[760px]:[grid-template-rows:repeat(var(--rows),64px)]"
    >
      {editing ? <Guides /> : null}
      {ordered.map((panel) => {
        const active = drag?.id === panel.id
        return (
          <BoardPanel
            key={panel.id}
            board={board}
            panel={panel}
            editing={editing}
            dragging={active}
            offset={active ? drag.offset : null}
            size={active && drag.mode === 'resize' ? { ...panel, w: drag.target.w, h: drag.target.h } : null}
            onFollow={onFollow}
            onGrip={startDrag('move')}
            onResize={startDrag('resize')}
            onNudge={nudge}
            onRemove={(p) => onChange(removePanel(board, p.id))}
          />
        )
      })}
      {drag ? <DropZone target={drag.target} /> : null}
    </div>
  )
}
