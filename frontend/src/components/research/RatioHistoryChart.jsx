import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'
import { fmtRatio, periodLabels, ratiosWithHistory } from '../../lib/ratioHistory'
import { Card, Select } from '../ui'

const MIN_POINTS = 2

export default function RatioHistoryChart({ history, className = '' }) {
  const c = useChartColors()
  const ratios = ratiosWithHistory(history).filter(
    (ratio) => history.filter((point) => point[ratio.key] != null).length >= MIN_POINTS,
  )
  const [chosen, setChosen] = useState(null)
  if (chosen !== null && !ratios.some((candidate) => candidate.key === chosen)) setChosen(null)
  if (!ratios.length) return null

  const ratio = ratios.find((candidate) => candidate.key === chosen) ?? ratios[0]
  const labels = periodLabels(history)
  const rows = history.map((point, index) => ({ year: labels[index], value: point[ratio.key] ?? null }))

  return (
    <Card
      className={className}
      context="Fiscal years, from Finnhub's annual series"
      dot="ok"
      title="Ratios by year"
      right={
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Ratio
          <Select value={ratio.key} onChange={(event) => setChosen(event.target.value)} className="w-auto">
            {ratios.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      }
    >
      <div className="h-[var(--chart-h-sm)]" role="img" aria-label={`${ratio.label} by fiscal year`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps(c)} />
            <XAxis {...axisProps(c)} dataKey="year" />
            <YAxis {...axisProps(c)} width={52} tickFormatter={(value) => fmtRatio(value, ratio.format)} />
            <Tooltip {...chartTooltipProps(c)} formatter={(value) => [fmtRatio(value, ratio.format), ratio.label]} />
            <Line dataKey="value" stroke={c.primary} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
