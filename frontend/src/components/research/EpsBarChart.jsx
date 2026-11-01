import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { axisProps, chartTooltipProps, gridProps, surpriseSign } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'
import { fmtPct } from '../../lib/format'
import { Card } from '../ui'

const surpriseTag = (v) => (v == null ? '' : fmtPct(v, { decimals: 1 }))

function barColor(surprise, c) {
  if (surprise == null) return c.primary
  return [c.down, c.estimate, c.up][surpriseSign(surprise) + 1]
}

function Swatch({ color, children }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  )
}

export default function EpsBarChart({ title, subtitle, data, format, control, className = '' }) {
  const c = useChartColors()
  if (!data?.length) return null

  const forward = data.filter((row) => row.forward)
  const hasEstimates = data.some((row) => row.estimate != null)

  return (
    <Card className={className} context={subtitle} dot="earn" title={title} right={control}>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps(c)} />
            {forward.length > 0 && (
              <ReferenceArea x1={forward[0].period} x2={forward.at(-1).period} fill={c.track} fillOpacity={0.5} strokeOpacity={0} />
            )}
            <XAxis {...axisProps(c)} dataKey="period" />
            <YAxis {...axisProps(c)} width={52} tickFormatter={format} />
            <ReferenceLine y={0} stroke={c.axis} />
            <Tooltip {...chartTooltipProps(c)} formatter={(value, name) => [format(value), name]} />
            {hasEstimates && (
              <Bar dataKey="estimate" name="Estimate" fill={c.estimate} radius={[3, 3, 0, 0]} barSize={18} isAnimationActive={false} />
            )}
            <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]} barSize={18} isAnimationActive={false}>
              <LabelList
                dataKey="surprise"
                position="top"
                formatter={surpriseTag}
                style={{ fontSize: 11, fill: c.axisCategory }}
              />
              {data.map((row) => (
                <Cell key={row.period} fill={barColor(row.surprise, c)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hasEstimates && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
          <Swatch color={c.estimate}>Estimate</Swatch>
          <Swatch color={c.up}>Beat</Swatch>
          <Swatch color={c.down}>Miss</Swatch>
        </div>
      )}
      {forward.length > 0 && (
        <p className="mt-2 text-[12px] text-ink-3">
          {forward.length} upcoming {forward.length === 1 ? 'quarter' : 'quarters'}, estimate only.
        </p>
      )}
    </Card>
  )
}
