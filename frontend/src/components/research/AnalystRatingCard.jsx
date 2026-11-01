import { ANALYST_GRADES, analystRating } from '../../lib/analystRating'
import { withAlpha } from '../../lib/charts'
import { fmtMonthYear } from '../../lib/format'
import { useChartColors } from '../../theme/useChartColors'
import { Card } from '../ui'
import AnalystCounts from './AnalystCounts'
import RatingGauge from './RatingGauge'

const gradeColors = (c) => [withAlpha(c.down, 0.75), withAlpha(c.down, 0.35), c.estimate, withAlpha(c.up, 0.4), withAlpha(c.up, 0.85)]

const BEST_FIRST = ANALYST_GRADES.map(([key, label], index) => ({ key, label, index })).reverse()

function monthSummary(month) {
  const counts = BEST_FIRST.map(({ key, label }) => `${month[key] || 0} ${label.toLowerCase()}`).join(', ')
  return `${fmtMonthYear(month.period)}: ${counts}`
}

function Trend({ history }) {
  const colors = gradeColors(useChartColors())
  const totals = history.map((month) => BEST_FIRST.reduce((sum, { key }) => sum + (month[key] || 0), 0))
  const tallest = Math.max(...totals, 1)

  return (
    <ol aria-label="Analyst ratings by month" className="mt-4 flex items-end justify-center gap-4 h-24">
      {history.map((month, index) => (
        <li key={month.period} aria-label={monthSummary(month)} className="flex h-full w-14 flex-col items-center justify-end gap-1">
          <span className="flex w-full flex-col overflow-hidden rounded-sm" style={{ height: `${(totals[index] / tallest) * 100}%` }}>
            {BEST_FIRST.map(({ key, index }) =>
              month[key] ? <span key={key} style={{ flexGrow: month[key], backgroundColor: colors[index] }} /> : null,
            )}
          </span>
          <span className="text-[11px] text-ink-3 whitespace-nowrap">{fmtMonthYear(month.period)}</span>
        </li>
      ))}
    </ol>
  )
}

export default function AnalystRatingCard({ fundamentals, className = '' }) {
  const rating = analystRating(fundamentals.recommendation)
  if (!rating) return null
  const history = fundamentals.recommendation_history ?? []

  return (
    <Card
      className={className}
      context={rating.period ? `${rating.total} analysts · as of ${fmtMonthYear(rating.period)}` : `${rating.total} analysts`}
      dot="ok"
      title="Analysts"
    >
      <div className="mx-auto max-w-xs">
        <RatingGauge title="Analyst rating" fraction={rating.fraction} label={rating.label} />
        <AnalystCounts rows={rating.counts.map((row) => [row.label, row.count])} />
      </div>
      {history.length > 1 && <Trend history={history} />}
    </Card>
  )
}
