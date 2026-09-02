import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useNetWorthHistory } from '../api/queries'
import { fmtEur } from '../lib/format'
import { chartTooltipProps, dateAxisProps, gridProps, moneyAxisProps, formatAxisDate } from '../lib/charts'
import { RangePills } from './RangePills'
import { Card, CardHeader } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'

export default function HistoryAreaChart({ title, subtitle, dataKey, name, color }) {
  const [range, setRange] = useState('6M')
  const { data, isLoading, error } = useNetWorthHistory(range)

  const placeholder = chartPlaceholderFor({ isLoading, error, data, minPoints: 2 })
  const gradientId = `${dataKey}Fill`

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        right={<RangePills value={range} onChange={setRange} />}
      />
      <div className="mt-4 h-[260px]">
        {placeholder ?? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis {...dateAxisProps} />
              <YAxis {...moneyAxisProps} />
              <Tooltip
                {...chartTooltipProps}
                labelFormatter={formatAxisDate}
                formatter={(value) => [fmtEur(value), name]}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                name={name}
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
