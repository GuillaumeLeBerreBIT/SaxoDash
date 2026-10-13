import { ANALYST_GRADES, analystRating } from '../../lib/analystRating'
import { RATING_SEGMENTS } from '../../lib/charts'
import { fmtMonthYear } from '../../lib/format'
import { Card, CardHeader } from '../ui'
import AnalystCounts from './AnalystCounts'
import RatingGauge from './RatingGauge'

const BEST_FIRST = ANALYST_GRADES.map(([key, label], index) => ({ key, label, color: RATING_SEGMENTS[index] })).reverse()

function monthSummary(month) {
  const counts = BEST_FIRST.map(({ key, label }) => `${month[key] || 0} ${label.toLowerCase()}`).join(', ')
  return `${fmtMonthYear(month.period)}: ${counts}`
}

function Trend({ history }) {
  const totals = history.map((month) => BEST_FIRST.reduce((sum, { key }) => sum + (month[key] || 0), 0))
  const tallest = Math.max(...totals, 1)

  return (
    <ol aria-label="Analyst ratings by month" className="mt-4 flex items-end justify-center gap-3 h-24">
      {history.map((month, index) => (
        <li key={month.period} aria-label={monthSummary(month)} className="flex h-full w-10 flex-col items-center justify-end gap-1">
          <span className="flex w-full flex-col overflow-hidden rounded-sm" style={{ height: `${(totals[index] / tallest) * 100}%` }}>
            {BEST_FIRST.map(({ key, color }) =>
              month[key] ? <span key={key} style={{ flexGrow: month[key], backgroundColor: color }} /> : null,
            )}
          </span>
          <span className="text-[var(--fig-2xs)] text-zinc-500 whitespace-nowrap">{fmtMonthYear(month.period)}</span>
        </li>
      ))}
    </ol>
  )
}

export default function AnalystRatingCard({ fundamentals }) {
  const rating = analystRating(fundamentals.recommendation)
  if (!rating) return null
  const history = fundamentals.recommendation_history ?? []

  return (
    <Card>
      <CardHeader
        title="Analyst rating"
        subtitle={rating.period ? `${rating.total} analysts · as of ${fmtMonthYear(rating.period)}` : `${rating.total} analysts`}
      />
      <div className="mt-3 mx-auto max-w-xs">
        <RatingGauge title="Analyst rating" fraction={rating.fraction} label={rating.label} />
        <AnalystCounts rows={rating.counts.map((row) => [row.label, row.count])} />
      </div>
      {history.length > 1 && <Trend history={history} />}
    </Card>
  )
}
