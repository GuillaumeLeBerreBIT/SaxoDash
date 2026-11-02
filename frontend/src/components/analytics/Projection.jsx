import { useMemo, useState } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, InfoTip, MetricTile, Segmented } from '../ui'
import { monteCarlo } from '../../lib/monteCarlo'
import { fmtEur, fmtNum } from '../../lib/format'
import { yearTicks } from '../../lib/portfolioStats'
import { chartTooltipProps, gridProps, axisProps } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'

const MONTHLY_OPTIONS = [500, 1000, 1500, 2000, 2500]
const YEAR_OPTIONS = [5, 10, 20, 30]
const MONTHLY_SEGMENTS = MONTHLY_OPTIONS.map((m) => ({ value: m, label: `€${m}` }))
const YEAR_SEGMENTS = YEAR_OPTIONS.map((y) => ({ value: y, label: `${y}Y` }))
const fmtK = (v) => `€${(v / 1000).toFixed(0)}k`

export default function Projection({ start, expectedReturnPct, volatilityPct }) {
  const c = useChartColors()
  const [monthly, setMonthly] = useState(1000)
  const [years, setYears] = useState(10)

  const rows = useMemo(
    () => monteCarlo({ start, monthly, years, expectedReturnPct, volatilityPct }),
    [start, monthly, years, expectedReturnPct, volatilityPct],
  )
  const end = rows[rows.length - 1]
  // Stacked areas draw a band, not four independent lines: each layer is the
  // gap above the one below it, so the stack's top edge lands on p90.
  const bands = rows.map((r) => ({
    ...r,
    lowBand: r.p10,
    midBand: r.p25 - r.p10,
    hiBand: r.p75 - r.p25,
    topBand: r.p90 - r.p75,
  }))

  return (
    <Card
      context={`600 simulated paths · ${fmtNum(expectedReturnPct, 1)}% expected return, ${fmtNum(volatilityPct, 1)}% volatility, drawn from your own return distribution`}
      dot="off"
      title={
        <span className="inline-flex items-center gap-1.5">
          Projection
          <InfoTip>
            A Monte Carlo simulation runs your monthly contribution forward through 600 randomly
            generated futures, each month's return drawn from a normal distribution centred on
            your portfolio's own average return and volatility. The shaded band is where the
            middle 80% of those futures land — nobody knows which one is real.
          </InfoTip>
        </span>
      }
      right={
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Monthly contribution" options={MONTHLY_SEGMENTS} value={monthly} onChange={setMonthly} className="max-w-full" />
          <Segmented label="Years" options={YEAR_SEGMENTS} value={years} onChange={setYears} />
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MetricTile label="Invested by then" value={fmtEur(end.invested, { decimals: 0 })} hint={`€${monthly}/mo for ${years} years`} />
        <MetricTile
          label="Median outcome"
          value={fmtEur(end.p50, { decimals: 0 })}
          hint={`${fmtNum((end.p50 / end.invested - 1) * 100, 0)}% above contributions`}
        />
        <MetricTile label="Pessimistic (P10)" value={fmtEur(end.p10, { decimals: 0 })} hint="1 in 10 paths below" />
        <MetricTile label="Optimistic (P90)" value={fmtEur(end.p90, { decimals: 0 })} hint="1 in 10 paths above" />
      </div>

      <div className="mt-4 h-[var(--chart-h-lg)]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={bands} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid {...gridProps(c)} />
            <XAxis {...axisProps(c)} dataKey="month" ticks={yearTicks(rows)} interval={0} tickFormatter={(m) => `${Math.round(m / 12)}y`} />
            <YAxis {...axisProps(c)} width={52} tickFormatter={fmtK} />
            <Tooltip
              {...chartTooltipProps(c)}
              labelFormatter={(m) => `Year ${(m / 12).toFixed(1)}`}
              formatter={(v, key, entry) => {
                const label = { lowBand: 'P10', midBand: 'P25', hiBand: 'P75', topBand: 'P90', p50: 'Median', invested: 'Contributed' }[key]
                const raw = { lowBand: entry.payload.p10, midBand: entry.payload.p25, hiBand: entry.payload.p75, topBand: entry.payload.p90, p50: entry.payload.p50, invested: entry.payload.invested }[key]
                return [fmtEur(raw, { decimals: 0 }), label]
              }}
            />
            <Area dataKey="lowBand" stackId="band" stroke="none" fill="transparent" />
            <Area dataKey="midBand" stackId="band" stroke="none" fill={c.primary} fillOpacity={0.1} />
            <Area dataKey="hiBand" stackId="band" stroke="none" fill={c.primary} fillOpacity={0.22} />
            <Area dataKey="topBand" stackId="band" stroke="none" fill={c.primary} fillOpacity={0.1} />
            <Line dataKey="p50" stroke={c.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="invested" stroke={c.axisCategory} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 md:gap-y-0 text-[12px] text-ink-3">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-2 shrink-0 rounded-sm" style={{ background: c.primary, opacity: 0.3 }} /> P10–P90 range</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-0.5" style={{ background: c.primary }} /> Median path</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-0.5" style={{ background: c.axisCategory }} /> Money contributed</span>
        <span className="w-full md:ml-auto md:w-auto">Simulation, not advice. Past distribution ≠ future returns.</span>
      </div>
    </Card>
  )
}
