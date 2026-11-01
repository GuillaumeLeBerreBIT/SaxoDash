import { withAlpha } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'
import { MoveCaption } from './chartHeader'

const WIDTH = 300
const HEIGHT = 110
const TOP = 6
const PLOT = 86
const DAYS = 366
const MONTH_TICKS = [
  ['Jan', 1],
  ['Apr', 91],
  ['Jul', 182],
  ['Oct', 274],
]

const xFor = (day) => (day / DAYS) * WIDTH

export default function SeasonalsChart({ series }) {
  const c = useChartColors()
  if (!series.length) return null

  const values = series.flatMap((row) => row.points.map((point) => point.pct))
  const high = Math.max(0, ...values)
  const low = Math.min(0, ...values)
  const span = high - low || 1
  const yFor = (pct) => TOP + ((high - pct) / span) * PLOT
  const latestIndex = series.length - 1

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Return by calendar year, from January">
        <line x1="0" x2={WIDTH} y1={yFor(0)} y2={yFor(0)} stroke={withAlpha(c.axis, 0.4)} />
        {series.map((row, index) => (
          <polyline
            key={row.year}
            points={row.points.map((point) => `${xFor(point.day).toFixed(1)},${yFor(point.pct).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={index === latestIndex ? c.primary : withAlpha(c.axis, 0.35 + (0.5 * index) / series.length)}
            strokeWidth={index === latestIndex ? 2 : 1}
          />
        ))}
        {MONTH_TICKS.map(([label, day]) => (
          <text key={label} x={xFor(day)} y={HEIGHT - 2} fill={c.axis} fontSize="11">
            {label}
          </text>
        ))}
      </svg>
      <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        {series.map((row) => {
          const closing = row.points[row.points.length - 1].pct
          return (
            <li key={row.year} className="flex justify-between">
              <span className="text-ink-3 num">{row.year}</span>
              <MoveCaption change={closing} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
