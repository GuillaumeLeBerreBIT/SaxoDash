import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useNetWorthHistory } from '../api/queries'
import { fmtEur } from '../lib/format'
import {
  chartTooltipProps, dateAxisProps, gridProps, moneyAxisProps, formatAxisDate,
  SERIES_BANK, SERIES_INVESTMENTS, SERIES_TOTAL,
} from '../lib/charts'
import { Pill, RangePills } from './RangePills'
import { Card, CardHeader } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'

const VIEWS = [
  { key: 'ALL', label: 'All' },
  { key: 'INVESTMENTS', label: 'Investments' },
  { key: 'BANK', label: 'Bank' },
]

const SERIES = [
  { key: 'INVESTMENTS', dataKey: 'portfolio_value', name: 'Positions', color: SERIES_INVESTMENTS },
  { key: 'BANK', dataKey: 'bank_total', name: 'Cash (bank + Saxo)', color: SERIES_BANK },
  { key: 'TOTAL', dataKey: 'net_worth', name: 'Total', color: SERIES_TOTAL },
]

function SeriesLegend({ series, dimmed }) {
  return (
    <ul aria-label="Chart series" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-[var(--fig-xs)] text-zinc-400">
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
  const [range, setRange] = useState('6M')
  const [view, setView] = useState('ALL')
  const { data, isLoading, error } = useNetWorthHistory(range)

  // Lines need two points; a single snapshot with dot={false} draws nothing.
  const placeholder = chartPlaceholderFor({ isLoading, error, data, minPoints: 2 })

  const showInvestments = view === 'ALL' || view === 'INVESTMENTS'
  const showBank = view === 'ALL' || view === 'BANK'
  const showTotal = view === 'ALL'
  const visible = SERIES.filter((s) => (view === 'ALL' ? true : s.key === view))

  return (
    <Card>
      <CardHeader
        title="Net worth history"
        subtitle="Portfolio and bank accounts over time"
        right={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-zinc-900/60 rounded-md p-0.5 border border-white/[0.06]">
              {VIEWS.map((v) => (
                <Pill key={v.key} active={view === v.key} onClick={() => setView(v.key)}>
                  {v.label}
                </Pill>
              ))}
            </div>
            <RangePills value={range} onChange={setRange} />
          </div>
        }
      />
      <div className="mt-4 h-[var(--chart-h-lg)]">
        {placeholder ?? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid {...gridProps} />
            <XAxis {...dateAxisProps} />
            <YAxis {...moneyAxisProps} />
            <Tooltip {...chartTooltipProps} labelFormatter={formatAxisDate} formatter={(v, n) => [fmtEur(v), n]} />
            {showInvestments && (
              <Line
                type="monotone"
                dataKey="portfolio_value"
                name="Positions"
                stroke={SERIES_INVESTMENTS}
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
                dataKey="bank_total"
                name="Cash (bank + Saxo)"
                stroke={SERIES_BANK}
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
                dataKey="net_worth"
                name="Total"
                stroke={SERIES_TOTAL}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>
      <SeriesLegend series={visible} dimmed={view === 'ALL'} />
    </Card>
  )
}
