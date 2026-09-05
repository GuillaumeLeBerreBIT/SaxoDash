import { useRiskMetrics } from '../api/queries'
import { Card, ChartPlaceholder, PageHeader } from '../components/ui'
import DrawdownChart from '../components/analytics/DrawdownChart'
import MonthlyReturnsHeatmap from '../components/analytics/MonthlyReturnsHeatmap'
import { fmtNum, fmtPct } from '../lib/format'

const SUBTITLE = 'Risk, computed from your own portfolio-value history'

function MetricTile({ label, value, hint }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-md px-3 py-2.5">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium leading-tight">{label}</div>
      <div className="num mt-1 text-[15px] text-zinc-100">{value}</div>
      {hint && <div className="text-[10px] text-zinc-600 mt-0.5">{hint}</div>}
    </div>
  )
}

function monthLabel(month) {
  if (!month) return '—'
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[month.month - 1]} ${month.year}`
}

export default function Analytics() {
  const { data, isLoading, error } = useRiskMetrics()

  if (isLoading || error || !data?.has_data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Analytics" subtitle={SUBTITLE} />
        <ChartPlaceholder tone={error ? 'red' : 'zinc'}>
          {isLoading && 'Loading…'}
          {!isLoading && error && 'Failed to load risk metrics'}
          {!isLoading && !error && 'Not enough history yet — risk metrics need at least two days of portfolio value.'}
        </ChartPlaceholder>
      </div>
    )
  }

  const {
    volatility, sharpe, sortino,
    max_drawdown: maxDrawdown, current_drawdown: currentDrawdown,
    positive_months_pct: positiveMonthsPct, best_month: bestMonth, worst_month: worstMonth,
    risk_free_annual: riskFreeAnnual, drawdown_series: drawdownSeries, monthly_returns: monthlyReturns,
  } = data

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" subtitle={SUBTITLE} />

      <Card>
        <div className="grid grid-cols-4 gap-3">
          <MetricTile label="Volatility (ann.)" value={`${fmtNum(volatility, 1)}%`} />
          <MetricTile
            label="Sharpe ratio"
            value={fmtNum(sharpe, 2)}
            hint={`Risk-free ${fmtNum(riskFreeAnnual * 100, 1)}%`}
          />
          <MetricTile label="Sortino ratio" value={fmtNum(sortino, 2)} hint="Downside-adjusted" />
          <MetricTile label="Max drawdown" value={`${fmtNum(maxDrawdown, 1)}%`} />
          <MetricTile label="Current drawdown" value={`${fmtNum(currentDrawdown, 1)}%`} hint="From all-time high" />
          <MetricTile label="Positive months" value={`${fmtNum(positiveMonthsPct, 0)}%`} />
          <MetricTile
            label="Best month"
            value={bestMonth ? fmtPct(bestMonth.pct, { decimals: 1 }) : '—'}
            hint={monthLabel(bestMonth)}
          />
          <MetricTile
            label="Worst month"
            value={worstMonth ? fmtPct(worstMonth.pct, { decimals: 1 }) : '—'}
            hint={monthLabel(worstMonth)}
          />
        </div>
      </Card>

      <DrawdownChart series={drawdownSeries} />
      <MonthlyReturnsHeatmap monthlyReturns={monthlyReturns} />
    </div>
  )
}
