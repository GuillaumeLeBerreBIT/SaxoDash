import { GripVertical, MoveDiagonal2, X } from 'lucide-react'

import { PANEL_TYPES, ROW_H } from '../../lib/boards'
import { PANELS } from './panels'

const GAP = 12
const HANDLE = 'w-7 h-7 rounded-[7px] grid place-items-center sd-raised bg-raised text-ink-2 hover:text-ink'

const panelHeight = (rows) => rows * ROW_H + (rows - 1) * GAP

export default function BoardPanel({ board, panel, editing, dragging, offset, size, onFollow, onGrip, onResize, onNudge, onRemove }) {
  const name = PANEL_TYPES[panel.type].name
  const Body = PANELS[panel.type]
  const shown = size ?? panel
  const style = {
    '--col': `${shown.x + 1} / span ${shown.w}`,
    '--row': `${shown.y + 1} / span ${shown.h}`,
    '--panel-h': `${panelHeight(panel.h)}px`,
    transform: offset ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined,
  }
  return (
    <section
      aria-label={name}
      data-panel={panel.id}
      style={style}
      className={`relative min-w-0 h-[var(--panel-h)] min-[760px]:h-auto min-[760px]:[grid-column:var(--col)] min-[760px]:[grid-row:var(--row)] ${
        dragging ? 'z-20 opacity-90' : ''
      }`}
    >
      <div inert={editing || undefined} className="h-full min-h-0">
        <Body board={board} panel={panel} onFollow={onFollow} />
      </div>
      {editing ? (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl outline-dashed outline-1 outline-ink-3" />
          <div className="absolute top-2.5 right-2.5 flex gap-1">
            <button
              type="button"
              aria-label={`Move ${name}`}
              title="Drag to move, or use the arrow keys"
              onPointerDown={(event) => onGrip(event, panel)}
              onKeyDown={(event) => onNudge(event, panel, 'move')}
              className={`${HANDLE} cursor-grab touch-none`}
            >
              <GripVertical size={16} aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Remove ${name}`} onClick={() => onRemove(panel)} className={HANDLE}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            aria-label={`Resize ${name}`}
            title="Drag to resize, or use the arrow keys"
            onPointerDown={(event) => onResize(event, panel)}
            onKeyDown={(event) => onNudge(event, panel, 'resize')}
            className={`${HANDLE} absolute bottom-1.5 right-1.5 cursor-nwse-resize touch-none`}
          >
            <MoveDiagonal2 size={14} aria-hidden="true" />
          </button>
        </>
      ) : null}
    </section>
  )
}
