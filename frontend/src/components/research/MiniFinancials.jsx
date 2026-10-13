import { STATEMENT_SERIES } from '../../lib/charts'
import { fmtStatement } from '../../lib/statements'

const YEARS = 5
const MIN_YEARS = 2
const SERIES = [
  ['revenue', 'revenue'],
  ['net_income', 'net income'],
]

function summary(year) {
  const parts = SERIES.filter(([key]) => year.income[key] != null).map(([key, name]) => `${name} ${fmtStatement(year.income[key])}`)
  return `${year.label}: ${parts.join(', ')}`
}

export default function MiniFinancials({ annual }) {
  const years = (annual ?? []).filter((year) => year.income?.revenue != null).slice(-YEARS)
  if (years.length < MIN_YEARS) return null

  const values = years.flatMap((year) => SERIES.map(([key]) => year.income[key] ?? 0))
  const high = Math.max(0, ...values)
  const low = Math.min(0, ...values)
  const span = high - low || 1
  const baseline = (high / span) * 100

  return (
    <div>
      <ol className="relative flex h-20 gap-2">
        {years.map((year) => (
          <li key={year.label} aria-label={summary(year)} className="relative flex-1">
            <div className="absolute inset-0 flex items-stretch justify-center gap-0.5">
              {SERIES.map(([key]) => {
                const value = year.income[key]
                if (value == null) return <span key={key} className="w-2.5" />
                const size = (Math.abs(value) / span) * 100
                return (
                  <span key={key} className="relative w-2.5">
                    <span
                      className="absolute left-0 right-0 rounded-sm"
                      style={{
                        top: `${value >= 0 ? baseline - size : baseline}%`,
                        height: `${Math.max(size, 1)}%`,
                        backgroundColor: STATEMENT_SERIES[key],
                      }}
                    />
                  </span>
                )
              })}
            </div>
            <span className="absolute -bottom-4 left-0 right-0 text-center text-[var(--fig-2xs)] text-zinc-500">
              {String(year.fiscal_year)}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-6 flex justify-center gap-3 text-[var(--fig-2xs)] text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATEMENT_SERIES.revenue }} /> Revenue
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATEMENT_SERIES.net_income }} /> Net income
        </span>
      </p>
    </div>
  )
}
