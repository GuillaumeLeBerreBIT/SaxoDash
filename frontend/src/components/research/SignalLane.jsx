import { PAD_R } from '../../lib/chartGeometry'
import { fmtDate } from '../../lib/format'
import { GRADE_WORDS, spreadSignalMarkers } from '../../lib/signals'

export const SIGNAL_LANE = 20
const DOT_WIDTH = 17
const DOT_HEIGHT = 13
const DOT_GAP = 2

function gradeColor(grade, colors) {
  if (grade === 'supported') return colors.accent
  if (grade === 'against') return colors.warn
  return colors.axis
}

const markerLabel = (marker) => `${marker.label} on ${fmtDate(marker.date)}. ${GRADE_WORDS[marker.grade]}.`

export function SignalLane({ markers, geometry, colors, top, onInspect }) {
  const y = top + (SIGNAL_LANE - DOT_HEIGHT) / 2
  return (
    <g data-no-pan data-testid="signal-lane">
      <line x1={0} x2={geometry.chartW} y1={top} y2={top} stroke={colors.grid} />
      {spreadSignalMarkers(markers, geometry.xAt, DOT_WIDTH + DOT_GAP).map((marker) => {
        const centre = marker.x
        const color = gradeColor(marker.grade, colors)
        const show = () => onInspect(marker)
        const hide = () => onInspect(null)
        return (
          <g
            key={`${marker.key}-${marker.date}`}
            data-testid="signal-marker"
            role="img"
            tabIndex={0}
            aria-label={markerLabel(marker)}
            className="cursor-default outline-none"
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
          >
            <rect
              x={centre - DOT_WIDTH / 2}
              y={y}
              width={DOT_WIDTH}
              height={DOT_HEIGHT}
              rx={DOT_HEIGHT / 2}
              fill={colors.pane}
              stroke={color}
            />
            <text x={centre} y={y + DOT_HEIGHT / 2 + 3} fill={color} fontSize="8" fontWeight="700" textAnchor="middle">
              {marker.code}
            </text>
          </g>
        )
      })}
    </g>
  )
}

const GRADE_TONE = { supported: 'text-accent', against: 'text-warn-text', unproven: 'text-ink-2', no_edge: 'text-ink-2', too_few: 'text-ink-2' }

export function SignalCard({ marker, x, bottom, width }) {
  const cardWidth = 264
  const left = Math.max(8, Math.min(width - PAD_R - cardWidth, x - cardWidth / 2))
  return (
    <div
      data-testid="signal-card"
      role="tooltip"
      className="absolute z-20 pointer-events-none rounded-lg border border-line bg-raised px-3 py-2 text-[11.5px] leading-5 shadow-lg"
      style={{ left, bottom, width: cardWidth }}
    >
      <p className="font-semibold text-[12px] text-ink">
        {marker.label} · {fmtDate(marker.date)}
      </p>
      <p className="text-ink-2">{marker.description}</p>
      <p className={`font-medium ${GRADE_TONE[marker.grade]}`}>{GRADE_WORDS[marker.grade]}</p>
      <p className="text-ink-3">{marker.evidence}</p>
    </div>
  )
}
