import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { usePerformance, usePortfolioSummary, usePositions, useRiskMetrics } from '../api/queries'
import { Alert, Card, CardHeader, ChartPlaceholder, MetricTile, PageHeader, StatStrip, StatRow, TabButton, TabList } from '../components/ui'
import { Pill } from '../components/RangePills'
import DrawdownChart from '../components/analytics/DrawdownChart'
import MonthlyReturnsHeatmap from '../components/analytics/MonthlyReturnsHeatmap'
import Projection from '../components/analytics/Projection'
import ReturnsTable from '../components/analytics/ReturnsTable'
import CalendarYears from '../components/analytics/CalendarYears'
import Attribution from '../components/analytics/Attribution'
import { fmtNum, fmtPct } from '../lib/format'
import { needsDaysNote, pctOrDash } from '../lib/portfolioStats'

const SUBTITLE = 'Performance, risk and projection, computed from your own portfolio-value history'
const AVG_RETURN_NOTE = 'Mean daily change of your Saxo account; deposits count as gains'
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
    <div className="flex flex-wrap items-center gap-1">
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
    <div className="space-y-4">
      {data.benchmark.reason && (
        <p className="text-[var(--fig-xs)] text-zinc-500">
          {data.benchmark.name} columns are blank — {data.benchmark.reason}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:[grid-template-columns:1fr_1.25fr]">
        <ReturnsTable periods={data.periods} benchmarkName={data.benchmark.name} />
        <CalendarYears years={data.calendar_years} benchmarkName={data.benchmark.name} />
      </div>
      {positions?.length > 0 && <Attribution positions={positions} />}
    </div>
  )
}

const RISK_TERMS = [
  ['Volatility (ann.)', 'Annualised swing in daily value.'],
  ['Sharpe ratio', 'Return per unit of risk.'],
  ['Sortino ratio', 'Like Sharpe, but counts only downside swings.'],
  ['Max / current drawdown', "Decline from the portfolio's own all-time peak."],
  ['Beta', 'How much you move relative to the benchmark (1.0 = in step with it).'],
  ['Tracking error', 'How far your returns stray from the benchmark, either direction.'],
  ['Information ratio', 'Excess return over the benchmark per unit of that stray.'],
  ['Jensen alpha', "Risk-adjusted excess return the benchmark's own beta wouldn't predict."],
]

/** An inline expand/collapse instead of a hover tooltip - 8 definitions is
 *  more text than InfoTip's small floating box reads well at any position,
 *  tooltip or not. Pushes the tiles below it down rather than floating an
 *  overlay that has to fight the viewport for space. */
function RiskDefinitions() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 text-[var(--fig-2xs)] text-zinc-500 hover:text-zinc-300"
      >
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Hide what these mean' : 'What do these mean?'}
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          {RISK_TERMS.map(([term, definition]) => (
            <div key={term} className="text-[var(--fig-2xs)] leading-snug">
              <dt className="inline font-medium text-zinc-300">{term}</dt>
              <dd className="inline text-zinc-500"> — {definition}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/** A labelled cluster of MetricTiles - groups 12 otherwise-equal-weight
 *  stats into "how rough was the ride" / "how consistent month to month" /
 *  "vs a benchmark" so the tab reads as three questions, not a flat wall of
 *  numbers. Same "uppercase tag over a row of facts" rhythm as Research's
 *  RatioGroup, so the two pages' dense-stat sections read as one system. */
function MetricGroup({ label, children }) {
  return (
    <div>
      <div className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-500 font-medium mb-2">{label}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{children}</div>
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
  const needsDays = data.needs_days ?? {}
  const benchNeedsDays = bench.needs_days ?? {}
  const hintWhenNull = (value, metric) => (value == null ? needsDaysNote(needsDays[metric]) : undefined)
  const benchValue = (value) => (bench.has_data && value != null)
  const benchHint = (value, metric) => (bench.has_data && value == null ? needsDaysNote(benchNeedsDays[metric]) : undefined)

  return (
    <div className="space-y-4">
      {/* items-start: without it, CSS Grid stretches the shorter Drawdown
          card to match Risk & return's height (now taller with the grouped
          tiles + definitions toggle) - a card whose border wraps far past
          its own 260px chart, empty for no reason. */}
      <div className="grid grid-cols-1 gap-4 lg:[grid-template-columns:1.15fr_1fr] items-start">
        <Card>
          <CardHeader title="Risk & return" subtitle={`Daily portfolio value · risk-free ${fmtNum(riskFreeAnnual * 100, 1)}%`} />
          <RiskDefinitions />
          <div className="mt-4 space-y-4">
            <MetricGroup label="Return & risk">
              <MetricTile label="Volatility (ann.)" value={pctOrDash(volatility)} hint={hintWhenNull(volatility, 'volatility')} />
              <MetricTile label="Sharpe ratio" value={fmtNum(sharpe, 2)} hint={hintWhenNull(sharpe, 'sharpe')} />
              <MetricTile label="Max drawdown" value={pctOrDash(maxDrawdown)} />
              <MetricTile label="Current drawdown" value={pctOrDash(currentDrawdown)} hint="From all-time high" />
            </MetricGroup>

            <MetricGroup label="Consistency">
              <MetricTile label="Sortino ratio" value={fmtNum(sortino, 2)} hint={sortino == null ? needsDaysNote(needsDays.sortino) : "Downside-adjusted"} />
              <MetricTile label="Positive months" value={pctOrDash(positiveMonthsPct, 0)} hint={hintWhenNull(positiveMonthsPct, 'monthly_stats')} />
              <MetricTile
                label="Best month"
                value={bestMonth ? fmtPct(bestMonth.pct, { decimals: 1 }) : '—'}
                hint={bestMonth ? monthLabel(bestMonth) : needsDaysNote(needsDays.monthly_stats)}
              />
              <MetricTile
                label="Worst month"
                value={worstMonth ? fmtPct(worstMonth.pct, { decimals: 1 }) : '—'}
                hint={worstMonth ? monthLabel(worstMonth) : needsDaysNote(needsDays.monthly_stats)}
              />
            </MetricGroup>

            <MetricGroup label={bench.has_data ? `Vs. benchmark (${bench.name})` : 'Vs. benchmark'}>
              <MetricTile
                label="Beta"
                value={benchValue(bench.beta) ? fmtNum(bench.beta, 2) : '—'}
                hint={bench.has_data ? benchHint(bench.beta, 'beta') : bench.reason}
              />
              <MetricTile
                label="Tracking error"
                value={benchValue(bench.tracking_error) ? pctOrDash(bench.tracking_error) : '—'}
                hint={benchHint(bench.tracking_error, 'tracking_error')}
              />
              <MetricTile
                label="Information ratio"
                value={benchValue(bench.information_ratio) ? fmtNum(bench.information_ratio, 2) : '—'}
                hint={benchHint(bench.information_ratio, 'information_ratio')}
              />
              <MetricTile
                label="Jensen alpha"
                value={benchValue(bench.jensen_alpha) ? fmtPct(bench.jensen_alpha, { decimals: 1 }) : '—'}
                hint={bench.has_data && bench.jensen_alpha != null ? 'Risk-adjusted excess' : benchHint(bench.jensen_alpha, 'jensen_alpha')}
              />
            </MetricGroup>
          </div>
        </Card>

        <DrawdownChart series={drawdownSeries} maxDrawdown={maxDrawdown} />
      </div>

      <MonthlyReturnsHeatmap monthlyReturns={monthlyReturns} />
    </div>
  )
}

/** Below ~1 year of history, annualised stats (volatility, Sharpe, Beta...)
 *  swing on estimation noise more than on real signal - shown, not hidden
 *  (the product principle is trustworthy-but-visible, not empty), but named
 *  for what it is rather than presented with false precision. 'high' and
 *  the has_data=false case (already its own placeholder above) render
 *  nothing here. */
function DataQualityNotice({ dataQuality, sampleSize }) {
  if (dataQuality !== 'low' && dataQuality !== 'medium') return null
  const days = sampleSize === 1 ? '1 day' : `${sampleSize} days`
  return (
    <Alert tone="info">
      Based on {days} of your own history — treat these figures as early
      reads, not stable long-run statistics. They firm up as more history
      accumulates.
    </Alert>
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
      <div className="space-y-4">
        <PageHeader title="Analytics" subtitle={SUBTITLE} />
        <ChartPlaceholder tone={error ? 'red' : 'zinc'}>
          {isLoading && 'Loading…'}
          {!isLoading && error && 'Failed to load risk metrics'}
          {!isLoading && !error && `Not enough history yet — risk metrics need at least two days of portfolio value (${data?.history_days ?? 0} so far).`}
        </ChartPlaceholder>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        subtitle={SUBTITLE}
        right={<BenchmarkSelector options={data.available_benchmarks} value={benchmark} onChange={setBenchmark} />}
      />

      <DataQualityNotice dataQuality={data.data_quality} sampleSize={data.sample_size} />

      <StatStrip>
        <StatRow
          label="Avg. return (ann.)"
          value={fmtPct(data.expected_return, { decimals: 1 })}
          note={
            data.expected_return == null
              ? needsDaysNote(data.needs_days?.expected_return) ?? AVG_RETURN_NOTE
              : AVG_RETURN_NOTE
          }
        />
        <StatRow
          label="Volatility"
          value={pctOrDash(data.volatility)}
          badge={data.sharpe == null ? undefined : `Sharpe ${fmtNum(data.sharpe, 2)}`}
          badgeTone="zinc"
        />
        <StatRow
          label="Max drawdown"
          value={pctOrDash(data.max_drawdown)}
          note={`Current ${pctOrDash(data.current_drawdown)}`}
        />
      </StatStrip>

      <TabList label="Analytics sections">
        {TABS.map(([key, label]) => (
          <TabButton key={key} active={tab === key} onClick={() => setTab(key)}>
            {label}
          </TabButton>
        ))}
      </TabList>

      {tab === 'performance' && <PerformanceTab data={performance} positions={positions} />}
      {tab === 'risk' && <RiskTab data={data} />}
      {tab === 'projection' && (
        summary?.total_value != null ? (
          <div className="space-y-4">
            {data.inputs_reliable === false && (
              <Alert tone="info">
                Projection inputs come from only {data.history_days} days of history, so the range
                below is illustrative, not a forecast.
              </Alert>
            )}
            <Projection
              start={summary.total_value}
              expectedReturnPct={data.projection_inputs?.expected_return}
              volatilityPct={data.projection_inputs?.volatility}
            />
          </div>
        ) : (
          <ChartPlaceholder>Loading portfolio value…</ChartPlaceholder>
        )
      )}
    </div>
  )
}
