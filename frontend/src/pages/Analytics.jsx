import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { usePerformance, usePortfolioSummary, usePositions, useRiskMetrics } from '../api/queries'
import { Alert, Card, ChartPlaceholder, MetricTile, Segmented, TabButton, TabList, Tile } from '../components/ui'
import DrawdownChart from '../components/analytics/DrawdownChart'
import MonthlyReturnsHeatmap from '../components/analytics/MonthlyReturnsHeatmap'
import Projection from '../components/analytics/Projection'
import ReturnsTable from '../components/analytics/ReturnsTable'
import CalendarYears from '../components/analytics/CalendarYears'
import Attribution from '../components/analytics/Attribution'
import { fmtNum, fmtPct } from '../lib/format'
import { needsDaysNote, pctOrDash } from '../lib/portfolioStats'

const CONTEXT = 'Daily portfolio value · computed from your own history'
const BOARD = 'grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start'
const SPAN_6 = 'min-[1100px]:col-span-6'
const SPAN_12 = 'min-[1100px]:col-span-12'
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
    <Segmented
      label="Benchmark"
      options={options.map(({ key, name }) => ({ value: key, label: name }))}
      value={value}
      onChange={onChange}
    />
  )
}

function PerformanceTab({ data, positions }) {
  if (!data) return <Card><ChartPlaceholder>Loading…</ChartPlaceholder></Card>

  return (
    <div className={BOARD}>
      {data.benchmark.reason && (
        <p className={`${SPAN_12} text-[12px] text-ink-3`}>
          {data.benchmark.name} columns are blank — {data.benchmark.reason}
        </p>
      )}
      <ReturnsTable className={SPAN_6} periods={data.periods} benchmarkName={data.benchmark.name} />
      <CalendarYears className={SPAN_6} years={data.calendar_years} benchmarkName={data.benchmark.name} />
      {positions?.length > 0 && <Attribution className={SPAN_12} positions={positions} />}
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
        className="flex items-center gap-1 min-h-11 md:min-h-0 text-[12px] font-medium text-ink-2 hover:text-ink"
      >
        <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Hide what these mean' : 'What do these mean?'}
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 rounded-[10px] bg-tile px-3.5 py-3">
          {RISK_TERMS.map(([term, definition]) => (
            <div key={term} className="text-[12px] leading-snug">
              <dt className="inline font-semibold text-ink">{term}</dt>
              <dd className="inline text-ink-2"> — {definition}</dd>
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
      <div className="text-[12px] font-medium text-ink-3 mb-2">{label}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{children}</div>
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
    <div className={BOARD}>
      {/* items-start: without it, CSS Grid stretches the shorter Drawdown
          card to match Risk & return's height (now taller with the grouped
          tiles + definitions toggle) - a card whose border wraps far past
          its own 260px chart, empty for no reason. */}
      <Card className={SPAN_6} context={`Daily portfolio value · risk-free ${fmtNum(riskFreeAnnual * 100, 1)}%`} dot="ok" title="Risk & return">
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

      <DrawdownChart className={SPAN_6} series={drawdownSeries} maxDrawdown={maxDrawdown} />

      <MonthlyReturnsHeatmap className={SPAN_12} monthlyReturns={monthlyReturns} />
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
      <>
        <h1 className="sr-only">Analytics</h1>
        <Card context={CONTEXT} dot={error ? 'warn' : 'off'} title="Return and risk">
          <ChartPlaceholder tone={error ? 'red' : undefined}>
            {isLoading && 'Loading…'}
            {!isLoading && error && 'Failed to load risk metrics'}
            {!isLoading && !error && `Not enough history yet — risk metrics need at least two days of portfolio value (${data?.history_days ?? 0} so far).`}
          </ChartPlaceholder>
        </Card>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-[var(--sd-gap,12px)]">
      <h1 className="sr-only">Analytics</h1>
      <Card
        context={`${CONTEXT} · vs ${data.benchmark.name}`}
        dot={data.data_quality === 'low' || data.data_quality === 'medium' ? 'warn' : 'ok'}
        title="Return and risk"
        right={<BenchmarkSelector options={data.available_benchmarks} value={benchmark} onChange={setBenchmark} />}
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
          <Tile
            label="Avg. return (ann.)"
            value={data.expected_return == null ? null : fmtPct(data.expected_return, { decimals: 1 })}
            sub={
              data.expected_return == null
                ? needsDaysNote(data.needs_days?.expected_return) ?? AVG_RETURN_NOTE
                : AVG_RETURN_NOTE
            }
          />
          <Tile
            label="Volatility"
            value={data.volatility == null ? null : pctOrDash(data.volatility)}
            sub={data.sharpe == null ? undefined : `Sharpe ${fmtNum(data.sharpe, 2)}`}
          />
          <Tile
            label="Max drawdown"
            value={data.max_drawdown == null ? null : pctOrDash(data.max_drawdown)}
            tone={data.max_drawdown < 0 ? 'down' : undefined}
            sub={`Current ${pctOrDash(data.current_drawdown)}`}
          />
        </div>
      </Card>

      <DataQualityNotice dataQuality={data.data_quality} sampleSize={data.sample_size} />

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
          <div className="flex flex-col gap-[var(--sd-gap,12px)]">
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
          <Card>
            <ChartPlaceholder>Loading portfolio value…</ChartPlaceholder>
          </Card>
        )
      )}
    </div>
  )
}
