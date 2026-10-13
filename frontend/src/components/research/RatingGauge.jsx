import { ESTIMATE, NEGATIVE, POSITIVE, withAlpha } from '../../lib/charts'

const SEGMENTS = [
  withAlpha(NEGATIVE, 0.75),
  withAlpha(NEGATIVE, 0.35),
  ESTIMATE,
  withAlpha(POSITIVE, 0.4),
  withAlpha(POSITIVE, 0.85),
]
const CENTER_X = 100
const CENTER_Y = 96
const RADIUS = 80
const NEEDLE = 62
const SWEEP = 180 / SEGMENTS.length
const GAP = 1.5

function pointAt(degrees, radius) {
  const radians = (degrees * Math.PI) / 180
  return [CENTER_X + radius * Math.cos(radians), CENTER_Y - radius * Math.sin(radians)].map((n) => n.toFixed(1))
}

const clamp = (value) => Math.min(1, Math.max(0, Number(value) || 0))

function toneClass(fraction) {
  if (fraction >= 0.6) return 'text-emerald-400'
  if (fraction <= 0.4) return 'text-red-400'
  return 'text-zinc-300'
}

export default function RatingGauge({ title, fraction, label }) {
  const position = clamp(fraction)
  const [needleX, needleY] = pointAt(180 - position * 180, NEEDLE)

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 104" className="w-full max-w-[210px]" role="img" aria-label={`${title}: ${label}`}>
        {SEGMENTS.map((color, index) => {
          const from = pointAt(180 - index * SWEEP - GAP, RADIUS)
          const to = pointAt(180 - (index + 1) * SWEEP + GAP, RADIUS)
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
          className="stroke-zinc-100"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={CENTER_X} cy={CENTER_Y} r="5" className="fill-zinc-100" />
      </svg>
      <div className={`text-[var(--fig-md)] font-medium ${toneClass(position)}`}>{label}</div>
    </div>
  )
}
