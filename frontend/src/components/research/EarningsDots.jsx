import { AXIS_TEXT, CATEGORY_AXIS_TEXT, surpriseColor } from '../../lib/charts'

const WIDTH = 300
const PLOT_TOP = 10
const PLOT_HEIGHT = 52
const LABEL_Y = 88
const RADIUS = 6
const QUARTERS_SHOWN = 4

function quarterLabel(iso) {
  const [year, month] = iso.split('-').map(Number)
  return `Q${Math.ceil(month / 3)} '${String(year).slice(2)}`
}

function columnsFor(history, next) {
  const reported = history
    .filter((row) => row.eps_actual != null)
    .slice(-QUARTERS_SHOWN)
    .map((row) => ({
      label: quarterLabel(row.date),
      actual: row.eps_actual,
      estimate: row.eps_estimate,
      surprise: row.eps_surprise_pct,
    }))
  const upcoming =
    next?.eps_estimate == null ? [] : [{ label: 'Next', actual: null, estimate: next.eps_estimate, surprise: null }]
  return [...reported, ...upcoming]
}

function describeColumn(column) {
  const figure = column.actual ?? column.estimate
  if (column.actual == null) return `${column.label} estimate ${figure.toFixed(2)}`
  const reported = `${column.label} ${column.actual.toFixed(2)}`
  return column.estimate == null ? reported : `${reported} against ${column.estimate.toFixed(2)}`
}

export default function EarningsDots({ history, next }) {
  const columns = columnsFor(history ?? [], next)
  if (!columns.length) return null

  const figures = columns.flatMap((column) => [column.actual, column.estimate]).filter((value) => value != null)
  const high = Math.max(...figures)
  const span = high - Math.min(...figures)
  const yFor = (value) => (span === 0 ? PLOT_TOP + PLOT_HEIGHT / 2 : PLOT_TOP + ((high - value) / span) * PLOT_HEIGHT)
  const step = WIDTH / columns.length
  const summary = columns.map(describeColumn).join('; ')

  return (
    <svg viewBox={`0 0 ${WIDTH} 92`} className="w-full" role="img" aria-label={`EPS, actual against estimate, by quarter: ${summary}`}>
      {columns.map((column, index) => {
        const x = step * (index + 0.5)
        return (
          <g key={column.label}>
            {column.estimate != null && (
              <circle
                data-dot="estimate"
                cx={x}
                cy={yFor(column.estimate)}
                r={RADIUS}
                fill="none"
                stroke={CATEGORY_AXIS_TEXT}
                strokeWidth="1.5"
              >
                <title>{`${column.label} estimate ${column.estimate.toFixed(2)}`}</title>
              </circle>
            )}
            {column.actual != null && (
              <circle data-dot="actual" cx={x} cy={yFor(column.actual)} r={RADIUS} fill={surpriseColor(column.surprise)}>
                <title>{`${column.label} actual ${column.actual.toFixed(2)}`}</title>
              </circle>
            )}
            <text x={x} y={LABEL_Y} textAnchor="middle" fill={AXIS_TEXT} fontSize="10">
              {column.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
