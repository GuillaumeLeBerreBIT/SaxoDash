import { useState } from 'react'
import { usePerformance, usePortfolioSummary, usePositions, useRiskMetrics } from '../api/queries'
import { Card, CardHeader, ChartPlaceholder, PageHeader, StatCard } from '../components/ui'
import { Pill } from '../components/RangePills'
import DrawdownChart from '../components/analytics/DrawdownChart'
import MonthlyReturnsHeatmap from '../components/analytics/MonthlyReturnsHeatmap'
import MetricTile from '../components/analytics/MetricTile'
import Projection from '../components/analytics/Projection'
import ReturnsTable from '../components/analytics/ReturnsTable'
import CalendarYears from '../components/analytics/CalendarYears'
import Attribution from '../components/analytics/Attribution'
import { fmtNum, fmtPct } from '../lib/format'

const SUBTITLE = 'Performance, risk and projection, computed from your own portfolio-value history'
const TABS = [
  ['performance', 'Performance'],
  ['risk', 'Risk'],
  ['projection', 'Projection'],
]

function monthLabel(month) {
  if (!month) return '—'
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[month.month - 1]} ${month.year}`
}

function BenchmarkSelector({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {options.map(({ key, name }) => (
        <Pill key={key} active={value === key} onClick={() => onChange(key)}>
          {name}
        </Pill>
      ))}
    </div>
  )
}

function PerformanceTab({ data, positions }) {
  if (!data) return <ChartPlaceholder>Loading…</ChartPlaceholder>

  return (
    <div className="space-y-5">
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1.25fr' }}>
        <ReturnsTable periods={data.periods} benchmarkName={data.benchmark.name} />
        <CalendarYears years={data.calendar_years} benchmarkName={data.benchmark.name} />
      </div>
      {positions?.length > 0 && <Attribution positions={positions} />}
    </div>
  )
}

function RiskTab({ data }) {
  const {
    volatility, sharpe, sortino,
    max_drawdown: maxDrawdown, current_drawdown: currentDrawdown,
    positive_months_pct: positiveMonthsPct, best_month: bestMonth, worst_month: worstMonth,
    risk_free_annual: riskFreeAnnual, drawdown_series: drawdownSeries, monthly_returns: monthlyReturns,
  } = data
  const bench = data.benchmark

  return (
    <div className="space-y-5">
      <div className="grid gap-4" style={{ gridTemplateColumns: '1.15fr 1fr' }}>
        <Card>
          <CardHeader title="Risk & return" subtitle={`Daily portfolio value · risk-free ${fmtNum(riskFreeAnnual * 100, 1)}%`} />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <MetricTile label="Volatility (ann.)" value={`${fmtNum(volatility, 1)}%`} />
            <MetricTile label="Sharpe ratio" value={fmtNum(sharpe, 2)} />
            <MetricTile label="Sortino ratio" value={fmtNum(sortino, 2)} hint="Downside-adjusted" />
            <MetricTile label="Current drawdown" value={`${fmtNum(currentDrawdown, 1)}%`} hint="From all-time high" />
            <MetricTile label="Positive months" value={`${fmtNum(positiveMonthsPct, 0)}%`} />
            <MetricTile label="Max drawdown" value={`${fmtNum(maxDrawdown, 1)}%`} />
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
            <MetricTile
              label="Beta"
              value={bench.has_data ? fmtNum(bench.beta, 2) : '—'}
              hint={bench.has_data ? `vs ${bench.name}` : bench.reason}
            />
            <MetricTile
              label="Tracking error"
              value={bench.has_data ? `${fmtNum(bench.tracking_error, 1)}%` : '—'}
            />
            <MetricTile
              label="Information ratio"
              value={bench.has_data ? fmtNum(bench.information_ratio, 2) : '—'}
            />
            <MetricTile
              label="Jensen alpha"
              value={bench.has_data ? fmtPct(bench.jensen_alpha, { decimals: 1 }) : '—'}
              hint="Risk-adjusted excess"
            />
          </div>
        </Card>

        <DrawdownChart series={drawdownSeries} maxDrawdown={maxDrawdown} />
      </div>

      <MonthlyReturnsHeatmap monthlyReturns={monthlyReturns} />
    </div>
  )
}

export default function Analytics() {
  const [tab, setTab] = useState('performance')
  const [benchmark, setBenchmark] = useState('world')
  const { data, isLoading, error } = useRiskMetrics(benchmark)
  const { data: performance } = usePerformance(benchmark) ?? {}
  const { data: summary } = usePortfolioSummary() ?? {}
  const { data: positions } = usePositions() ?? {}

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
      <PageHeader
        title="Analytics"
        subtitle={SUBTITLE}
        right={<BenchmarkSelector options={data.available_benchmarks} value={benchmark} onChange={setBenchmark} />}
      />

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Time-weighted (ann.)"
          value={fmtPct(data.expected_return, { decimals: 1 })}
          note="From your own portfolio-value history"
        />
        <StatCard
          label="Volatility"
          value={`${fmtNum(data.volatility, 1)}%`}
          badge={`Sharpe ${fmtNum(data.sharpe, 2)}`}
          badgeTone="zinc"
        />
        <StatCard
          label="Max drawdown"
          value={`${fmtNum(data.max_drawdown, 1)}%`}
          note={`Current ${fmtNum(data.current_drawdown, 1)}%`}
        />
        <StatCard
          label="Money-weighted (XIRR)"
          value="—"
          note="Needs deposit history the app doesn't sync yet"
        />
      </div>

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

      {tab === 'performance' && <PerformanceTab data={performance} positions={positions} />}
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
