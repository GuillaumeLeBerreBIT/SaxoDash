import {
  CartesianGrid,
  LabelList,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from 'recharts'

import { axisProps, gridProps, chartTooltipProps } from '../../lib/charts'
import { Card, CardHeader, InfoTip } from '../ui'

const MIN_POINTS = 2

function QuadrantTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div
      style={chartTooltipProps.contentStyle}
      className="text-[11.5px]"
    >
      <div className="font-medium text-zinc-100 mb-1">{p.symbol}</div>
      <div style={chartTooltipProps.itemStyle}>Quality: {p.quality}</div>
      <div style={chartTooltipProps.itemStyle}>Valuation: {p.valuation} (higher = pricier)</div>
    </div>
  )
}

/** Business quality x valuation richness, so "excellent business, bad
 *  price" and "average business, cheap price" are a glance instead of an
 *  inference across the ratios table above. `points`: `[{symbol, quality,
 *  valuation, isSelf}]`, 0-100 each, from lib/quadrant.js. */
export default function QualityValuationQuadrant({ points }) {
  if (!points || points.length < MIN_POINTS) return null

  const self = points.filter((p) => p.isSelf)
  const peers = points.filter((p) => !p.isSelf)

  return (
    <Card>
      <CardHeader
        title="Quality vs. valuation"
        subtitle="Where this stock sits against its peers"
        right={
          <InfoTip>
            Quality averages ROE, net margin and leverage against the same thresholds the
            Investment Snapshot uses. Valuation reads PEG and P/E vs. its own history. Both are
            0-100 reads, not fundamentals themselves - a quick placement, not a verdict.
          </InfoTip>
        }
      />
      <div className="mt-4 h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              {...axisProps}
              type="number"
              dataKey="valuation"
              domain={[0, 100]}
              label={{ value: 'Cheaper → Pricier', position: 'insideBottom', offset: -4, fill: '#71717a', fontSize: 10 }}
            />
            <YAxis
              {...axisProps}
              type="number"
              dataKey="quality"
              domain={[0, 100]}
              width={36}
              label={{ value: 'Quality →', angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 10 }}
            />
            <ReferenceLine x={50} stroke="rgba(255,255,255,0.12)" />
            <ReferenceLine y={50} stroke="rgba(255,255,255,0.12)" />
            <Tooltip content={<QuadrantTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={peers} fill="#60a5fa">
              <LabelList dataKey="symbol" position="top" style={{ fontSize: 10, fill: '#a1a1aa' }} />
            </Scatter>
            <Scatter data={self} fill="#34d399" shape="star">
              <LabelList dataKey="symbol" position="top" style={{ fontSize: 10, fill: '#34d399' }} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
