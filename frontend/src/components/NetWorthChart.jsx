import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getNetWorthHistory } from '../api/client'
import { fmtEur } from '../lib/format'
import { chartTooltipProps, formatAxisDate } from '../lib/charts'
import { Pill, RangePills } from './RangePills'
import { Card, CardHeader } from './ui'

const VIEWS = [
  { key: 'ALL', label: 'All' },
  { key: 'INVESTMENTS', label: 'Investments' },
  { key: 'BANK', label: 'Bank' },
]

export default function NetWorthChart() {
  const [range, setRange] = useState('6M')
  const [view, setView] = useState('ALL')
  const [data, setData] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getNetWorthHistory(range)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load net worth history')
      })
    return () => {
      cancelled = true
    }
  }, [range])

  if (error) {
    return (
      <Card>
        <div className="text-red-400 text-sm">{error}</div>
      </Card>
    )
  }

  const showInvestments = view === 'ALL' || view === 'INVESTMENTS'
  const showBank = view === 'ALL' || view === 'BANK'
  const showTotal = view === 'ALL'

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
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatAxisDate}
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
              tickFormatter={(v) => fmtEur(v, { decimals: 0 })}
            />
            <Tooltip {...chartTooltipProps} labelFormatter={formatAxisDate} formatter={(v, n) => [fmtEur(v), n]} />
            {showInvestments && (
              <Line
                type="monotone"
                dataKey="portfolio_value"
                name="Investments"
                stroke="#34d399"
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
                name="Bank"
                stroke="#fbbf24"
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
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
