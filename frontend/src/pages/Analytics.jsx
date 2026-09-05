import { useState } from 'react'
import { usePortfolioSummary, useRiskMetrics } from '../api/queries'
import { Card, ChartPlaceholder, PageHeader } from '../components/ui'
import DrawdownChart from '../components/analytics/DrawdownChart'
import MonthlyReturnsHeatmap from '../components/analytics/MonthlyReturnsHeatmap'
import MetricTile from '../components/analytics/MetricTile'
import Projection from '../components/analytics/Projection'
import { fmtNum, fmtPct } from '../lib/format'

const SUBTITLE = 'Risk and projection, computed from your own portfolio-value history'
const TABS = [
  ['risk', 'Risk'],
  ['projection', 'Projection'],
]

function monthLabel(month) {
  if (!month) return '—'
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[month.month - 1]} ${month.year}`
}

function RiskTab({ data }) {
  const {
    volatility, sharpe, sortino,
    max_drawdown: maxDrawdown, current_drawdown: currentDrawdown,
    positive_months_pct: positiveMonthsPct, best_month: bestMonth, worst_month: worstMonth,
    risk_free_annual: riskFreeAnnual, drawdown_series: drawdownSeries, monthly_returns: monthlyReturns,
  } = data

  return (
    <div className="space-y-5">
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

export default function Analytics() {
  const [tab, setTab] = useState('risk')
  const { data, isLoading, error } = useRiskMetrics()
  const { data: summary } = usePortfolioSummary() ?? {}

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

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" subtitle={SUBTITLE} />

      <div className="flex items-center gap-1 border-b border-white/[0.06]">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`h-9 px-3.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'text-zinc-100 border-blue-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'risk' && <RiskTab data={data} />}
      {tab === 'projection' && (
        summary?.total_value != null ? (
          <Projection start={summary.total_value} expectedReturnPct={data.expected_return} volatilityPct={data.volatility} />
        ) : (
          <ChartPlaceholder>Loading portfolio value…</ChartPlaceholder>
        )
      )}
    </div>
  )
}
