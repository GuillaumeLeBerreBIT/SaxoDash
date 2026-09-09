import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { axisProps, chartTooltipProps, surpriseColor } from '../../lib/charts'

/** Diverging bars around a zero baseline: one bar per period, green above /
 *  red below. A glanceable read of a run of signed values - the calendar's
 *  beat/miss-by-day strip uses it.
 *
 *  `data`: `[{ label, value }]`. `format` renders both the axis label and the
 *  tooltip value. `showLabels` prints the value on each bar (off by default -
 *  it collides in short plots). */
export default function SurpriseBars({
  data,
  height = 148,
  format = (v) => `${v}`,
  label = 'Value',
  showLabels = false,
}) {
  if (!data?.length) return null

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: showLabels ? 16 : 6, right: 6, left: 6, bottom: 0 }}>
          <XAxis {...axisProps} dataKey="label" interval={0} height={16} />
          <YAxis hide domain={[(min) => Math.min(0, min) * 1.3, (max) => Math.max(0, max) * 1.3]} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
          <Tooltip {...chartTooltipProps} cursor={false} formatter={(v) => [format(v), label]} />
          <Bar dataKey="value" radius={2} maxBarSize={26} isAnimationActive={false}>
            {showLabels && (
              <LabelList dataKey="value" position="top" formatter={format} style={{ fontSize: 10, fill: '#a1a1aa' }} />
            )}
            {data.map((d) => (
              <Cell key={d.label} fill={surpriseColor(d.value)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
