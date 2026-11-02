import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useNetWorthHistory } from '../api/queries'
import { fmtEur } from '../lib/format'
import { chartTooltipProps, dateAxisProps, gridProps, moneyAxisProps, formatAxisDate, seriesAxis } from '../lib/charts'
import { useChartColors } from '../theme/useChartColors'
import { RANGES } from './RangePills'
import { Segmented } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'

const seriesFor = (c) => [
  { key: 'INVESTMENTS', dataKey: 'portfolio_value', name: 'Positions', color: c.series[0] },
  { key: 'BANK', dataKey: 'bank_total', name: 'Cash (bank + Saxo)', color: c.series[1] },
  { key: 'TOTAL', dataKey: 'net_worth', name: 'Total', color: c.series[2] },
]

function SeriesLegend({ series, dimmed }) {
  return (
    <ul aria-label="Chart series" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <span
            className="w-4 border-t-2"
            style={{ borderColor: s.color, borderStyle: dimmed && s.key !== 'TOTAL' ? 'dashed' : 'solid' }}
          />
          {s.name}
        </li>
      ))}
    </ul>
  )
}

export default function NetWorthChart() {
  const c = useChartColors()
  const SERIES = seriesFor(c)
  const VIEWS = [{ key: 'ALL', name: 'All' }, ...SERIES]
  const [range, setRange] = useState('6M')
  const [view, setView] = useState('ALL')
  const { data, isLoading, error, refetch } = useNetWorthHistory(range)

  // Lines need two points; a single snapshot with dot={false} draws nothing.
  const placeholder = chartPlaceholderFor({ isLoading, error, data, minPoints: 2, onRetry: refetch })

  const visible = SERIES.filter((s) => view === 'ALL' || s.key === view)
  const isVisible = (key) => visible.some((s) => s.key === key)
  const showInvestments = isVisible('INVESTMENTS')
  const showBank = isVisible('BANK')
  const showTotal = isVisible('TOTAL')

  return (
    <section aria-labelledby="net-worth-history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 id="net-worth-history" className="text-[14px] font-bold text-ink">Net worth history</h3>
          <p className="text-[12px] text-ink-3">Portfolio and bank accounts over time</p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <Segmented
            label="Series"
            options={VIEWS.map((v) => ({ value: v.key, label: v.name }))}
            value={view}
            onChange={setView}
          />
          <Segmented
            label="Range"
            options={RANGES.map((r) => ({ value: r, label: r }))}
            value={range}
            onChange={setRange}
          />
        </div>
      </div>
      <div className="mt-3 h-[var(--chart-h-lg)]">
        {placeholder ?? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid {...gridProps(c)} />
            <XAxis {...dateAxisProps(c)} />
            <YAxis {...moneyAxisProps(c)} {...seriesAxis(data ?? [], visible.map((s) => s.dataKey))} />
            <Tooltip {...chartTooltipProps(c)} labelFormatter={formatAxisDate} formatter={(v, n) => [fmtEur(v), n]} />
            {showInvestments && (
              <Line
                type="monotone"
                dataKey={SERIES[0].dataKey}
                name={SERIES[0].name}
                stroke={SERIES[0].color}
                strokeWidth={showTotal ? 1.5 : 2}
                strokeOpacity={showTotal ? 0.5 : 1}
                strokeDasharray={showTotal ? '4 3' : undefined}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {showBank && (
              <Line
                type="monotone"
                dataKey={SERIES[1].dataKey}
                name={SERIES[1].name}
                stroke={SERIES[1].color}
                strokeWidth={showTotal ? 1.5 : 2}
                strokeOpacity={showTotal ? 0.5 : 1}
                strokeDasharray={showTotal ? '4 3' : undefined}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {showTotal && (
              <Line
                type="monotone"
                dataKey={SERIES[2].dataKey}
                name={SERIES[2].name}
                stroke={SERIES[2].color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>
      {!placeholder && <SeriesLegend series={visible} dimmed={view === 'ALL'} />}
    </section>
  )
}
