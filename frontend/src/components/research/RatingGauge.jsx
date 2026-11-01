import { withAlpha } from '../../lib/charts'
import { ratingBand } from '../../lib/ratingBand'
import { useChartColors } from '../../theme/useChartColors'

const CENTER_X = 100
const CENTER_Y = 96
const RADIUS = 80
const NEEDLE = 62
const GAP = 1.5

function pointAt(degrees, radius) {
  const radians = (degrees * Math.PI) / 180
  return [CENTER_X + radius * Math.cos(radians), CENTER_Y - radius * Math.sin(radians)].map((n) => n.toFixed(1))
}

const clamp = (value) => Math.min(1, Math.max(0, Number(value) || 0))

function toneClass(fraction) {
  const band = ratingBand(fraction)
  if (band >= 3) return 'text-up'
  if (band <= 1) return 'text-down'
  return 'text-ink-2'
}

const segmentColors = (c) => [
  withAlpha(c.down, 0.75),
  withAlpha(c.down, 0.35),
  c.estimate,
  withAlpha(c.up, 0.4),
  withAlpha(c.up, 0.85),
]

export default function RatingGauge({ title, fraction, label }) {
  const segments = segmentColors(useChartColors())
  const sweep = 180 / segments.length
  const position = clamp(fraction)
  const [needleX, needleY] = pointAt(180 - position * 180, NEEDLE)

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 104" className="w-full max-w-[210px]" role="img" aria-label={`${title}: ${label}`}>
        {segments.map((color, index) => {
          const from = pointAt(180 - index * sweep - GAP, RADIUS)
          const to = pointAt(180 - (index + 1) * sweep + GAP, RADIUS)
          return (
            <path
              key={index}
              d={`M${from.join(' ')} A${RADIUS} ${RADIUS} 0 0 1 ${to.join(' ')}`}
              fill="none"
              stroke={color}
              strokeWidth="11"
            />
          )
        })}
        <line
          x1={CENTER_X}
          y1={CENTER_Y}
          x2={needleX}
          y2={needleY}
          className="stroke-ink"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={CENTER_X} cy={CENTER_Y} r="5" className="fill-ink" />
      </svg>
      <div className={`text-[15px] font-semibold ${toneClass(position)}`}>{label}</div>
    </div>
  )
}
