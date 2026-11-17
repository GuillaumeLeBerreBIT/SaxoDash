import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'

import ChartFrame from '../ChartFrame'
import { axisProps, chartTooltipProps, dateAxisProps, formatAxisDate, gridProps, seriesAxis } from '../../lib/charts'
import { fmtPct } from '../../lib/format'
import { GROWTH_RANGES, growthFor, lastPct } from '../../lib/growth'
import { useChartColors } from '../../theme/useChartColors'
import { Card, ChartPlaceholder, Segmented } from '../ui'

function LegendItem({ dashed, color, label, pct }) {
  const tone = pct == null ? 'text-ink-3' : pct >= 0 ? 'text-up' : 'text-down'
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
      <span aria-hidden className="w-5" style={{ borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
      {label}
      <b className={`num ${tone}`}>{pct == null ? '—' : fmtPct(pct, { decimals: 1 })}</b>
    </span>
  )
}

export default function GrowthChart({ growth, benchmarkName, className = '' }) {
  const c = useChartColors()
  const [range, setRange] = useState('1M')
  const rows = growthFor(growth, range)
  const options = GROWTH_RANGES.map(({ value, label }) => ({ value, label }))
  return (
    <Card className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1" data-testid="growth-legend">
          <LegendItem color={c.primary} label="You" pct={lastPct(rows, 'portfolio')} />
          <LegendItem dashed color={c.bench} label={benchmarkName} pct={lastPct(rows, 'benchmark')} />
        </div>
        <Segmented label="Range" options={options} value={range} onChange={setRange} />
      </div>
      <ChartFrame
        className="h-[240px] md:h-[300px]"
        placeholder={rows.length < 2 ? <ChartPlaceholder>Not enough history yet to draw the comparison.</ChartPlaceholder> : null}
      >
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps(c)} />
          <XAxis {...dateAxisProps(c)} minTickGap={56} interval="preserveStartEnd" />
          <YAxis {...axisProps(c)} width={44} {...seriesAxis(rows, ['portfolio', 'benchmark'])} tickFormatter={(value) => Math.round(value)} />
          <ReferenceLine y={100} stroke={c.axis} />
          <Tooltip
            {...chartTooltipProps(c)}
            labelFormatter={formatAxisDate}
            formatter={(value, name) => [fmtPct(Number(value) - 100, { decimals: 1 }), name]}
          />
          <Line type="monotone" dataKey="benchmark" name={benchmarkName} stroke={c.bench} strokeWidth={2} strokeDasharray="6 5" dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="portfolio" name="You" stroke={c.primary} strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartFrame>
      <p className="mt-2 text-[12px] text-ink-3">Both lines start at 100 on the first day of the range.</p>
    </Card>
  )
}
