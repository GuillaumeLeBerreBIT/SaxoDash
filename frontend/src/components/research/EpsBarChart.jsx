import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { axisProps, BEAT, chartTooltipProps, ESTIMATE, gridProps, MISS, REPORTED, surpriseColor } from '../../lib/charts'
import { fmtPct } from '../../lib/format'
import { Card, CardHeader } from '../ui'

const barColor = (surprise) => (surprise == null ? REPORTED : surpriseColor(surprise))
const surpriseTag = (v) => (v == null ? '' : fmtPct(v, { decimals: 1 }))

/** Actual vs. estimate EPS over recent quarters. The estimate is the grey
 *  reference bar; the actual is coloured by whether it beat consensus and
 *  labelled with the surprise %. `data`: `[{ period, actual, estimate,
 *  surprise }]`; `format` renders the Y axis and tooltip values. */
export default function EpsBarChart({ title, subtitle, data, format }) {
  if (!data?.length) return null

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        right={
          <div className="flex items-center gap-3 text-[10.5px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: ESTIMATE }} /> Estimate</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: BEAT }} /> Beat</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: MISS }} /> Miss</span>
          </div>
        }
      />
      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="period" />
            <YAxis {...axisProps} width={52} tickFormatter={format} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
            <Tooltip
              {...chartTooltipProps}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              formatter={(value, name) => [format(value), name]}
            />
            <Bar dataKey="estimate" name="Estimate" fill={ESTIMATE} radius={[3, 3, 0, 0]} barSize={18} isAnimationActive={false} />
            <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]} barSize={18} isAnimationActive={false}>
              <LabelList
                dataKey="surprise"
                position="top"
                formatter={surpriseTag}
                style={{ fontSize: 10, fill: '#a1a1aa' }}
              />
              {data.map((row) => (
                <Cell key={row.period} fill={barColor(row.surprise)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
