import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { SERIES_TOTAL, axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { fmtRatio, ratiosWithHistory } from '../../lib/ratioHistory'
import { Select } from '../ui'

const MIN_POINTS = 2

export default function RatioHistoryChart({ history }) {
  const ratios = ratiosWithHistory(history).filter(
    (ratio) => history.filter((point) => point[ratio.key] != null).length >= MIN_POINTS,
  )
  const [chosen, setChosen] = useState(null)
  if (!ratios.length) return null

  const ratio = ratios.find((candidate) => candidate.key === chosen) ?? ratios[0]
  const rows = history.map((point) => ({ year: point.period.slice(0, 4), value: point[ratio.key] ?? null }))

  return (
    <div>
      <label className="flex items-center gap-2 text-[var(--fig-xs)] text-zinc-400">
        Ratio
        <Select value={ratio.key} onChange={(event) => setChosen(event.target.value)} className="w-auto">
          {ratios.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>
      <div className="mt-3 h-[var(--chart-h-sm)]" role="img" aria-label={`${ratio.label} by fiscal year`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="year" />
            <YAxis {...axisProps} width={52} tickFormatter={(value) => fmtRatio(value, ratio.format)} />
            <Tooltip {...chartTooltipProps} formatter={(value) => [fmtRatio(value, ratio.format), ratio.label]} />
            <Line dataKey="value" stroke={SERIES_TOTAL} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
