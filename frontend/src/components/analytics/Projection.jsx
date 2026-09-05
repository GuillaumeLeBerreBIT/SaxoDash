import { useMemo, useState } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardHeader } from '../ui'
import { Pill } from '../RangePills'
import MetricTile from './MetricTile'
import { monteCarlo } from '../../lib/monteCarlo'
import { fmtEur, fmtNum } from '../../lib/format'
import { chartTooltipProps, gridProps, axisProps } from '../../lib/charts'

const MONTHLY_OPTIONS = [500, 1000, 1500, 2000, 2500]
const YEAR_OPTIONS = [5, 10, 20, 30]
const fmtK = (v) => `€${(v / 1000).toFixed(0)}k`

export default function Projection({ start, expectedReturnPct, volatilityPct }) {
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
    <Card>
      <CardHeader
        title="Projection"
        subtitle={`600 simulated paths · ${fmtNum(expectedReturnPct, 1)}% expected return, ${fmtNum(volatilityPct, 1)}% volatility, drawn from your own return distribution`}
        right={
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-zinc-950/60 border border-white/[0.06]">
              {MONTHLY_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMonthly(m)}
                  className={`px-2 h-6 text-[11px] font-medium rounded num ${
                    monthly === m ? 'bg-zinc-800 text-zinc-50 ring-1 ring-white/10' : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  €{m}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {YEAR_OPTIONS.map((y) => (
                <Pill key={y} active={years === y} onClick={() => setYears(y)}>
                  {y}Y
                </Pill>
              ))}
            </div>
          </div>
        }
      />

      <div className="mt-4 grid grid-cols-4 gap-3">
        <MetricTile label="Invested by then" value={fmtEur(end.invested, { decimals: 0 })} hint={`€${monthly}/mo for ${years} years`} />
        <MetricTile
          label="Median outcome"
          value={fmtEur(end.p50, { decimals: 0 })}
          hint={`${fmtNum((end.p50 / end.invested - 1) * 100, 0)}% above contributions`}
        />
        <MetricTile label="Pessimistic (P10)" value={fmtEur(end.p10, { decimals: 0 })} hint="1 in 10 paths below" />
        <MetricTile label="Optimistic (P90)" value={fmtEur(end.p90, { decimals: 0 })} hint="1 in 10 paths above" />
      </div>

      <div className="mt-4 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={bands} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="month" tickFormatter={(m) => `${Math.round(m / 12)}y`} />
            <YAxis {...axisProps} width={52} tickFormatter={fmtK} />
            <Tooltip
              {...chartTooltipProps}
              labelFormatter={(m) => `Year ${(m / 12).toFixed(1)}`}
              formatter={(v, key, entry) => {
                const label = { lowBand: 'P10', midBand: 'P25', hiBand: 'P75', topBand: 'P90', p50: 'Median', invested: 'Contributed' }[key]
                const raw = { lowBand: entry.payload.p10, midBand: entry.payload.p25, hiBand: entry.payload.p75, topBand: entry.payload.p90, p50: entry.payload.p50, invested: entry.payload.invested }[key]
                return [fmtEur(raw, { decimals: 0 }), label]
              }}
            />
            <Area dataKey="lowBand" stackId="band" stroke="none" fill="transparent" />
            <Area dataKey="midBand" stackId="band" stroke="none" fill="#3b82f6" fillOpacity={0.1} />
            <Area dataKey="hiBand" stackId="band" stroke="none" fill="#3b82f6" fillOpacity={0.22} />
            <Area dataKey="topBand" stackId="band" stroke="none" fill="#3b82f6" fillOpacity={0.1} />
            <Line dataKey="p50" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="invested" stroke="#a1a1aa" strokeWidth={1.3} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-4 text-[10.5px] text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-blue-500/25" /> P10–P90 range</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-400" /> Median path</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-zinc-400" /> Money contributed</span>
        <span className="ml-auto">Simulation, not advice. Past distribution ≠ future returns.</span>
      </div>
    </Card>
  )
}
