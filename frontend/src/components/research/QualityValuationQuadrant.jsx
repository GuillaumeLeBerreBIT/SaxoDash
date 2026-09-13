import {
  CartesianGrid,
  LabelList,
  ReferenceArea,
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

// Scores are 0-100, but plotting them flush against that exact boundary
// pins edge-case dots (and their symbol labels) to the SVG's own border,
// where they clip. A few points of headroom on each side fixes that without
// changing what the numbers mean.
const PAD = 8
const DOMAIN = [-PAD, 100 + PAD]
const TICKS = [0, 25, 50, 75, 100]

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
      <div className="flex items-center justify-between mt-3 px-1 text-[10px] text-zinc-600">
        <span>Cheaper</span>
        <span>Pricier →</span>
      </div>
      <div className="flex gap-2 mt-1">
        <span className="text-[10px] text-zinc-600 [writing-mode:vertical-rl] rotate-180 shrink-0">
          Quality →
        </span>
        <div className="h-[220px] flex-1 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 14, right: 20, left: 4, bottom: 4 }}>
              <CartesianGrid {...gridProps} />
              <ReferenceArea x1={50} x2={100 + PAD} y1={50} y2={100 + PAD} fill="#f87171" fillOpacity={0.04} />
              <ReferenceArea x1={-PAD} x2={50} y1={-PAD} y2={50} fill="#f87171" fillOpacity={0.04} />
              <ReferenceArea x1={-PAD} x2={50} y1={50} y2={100 + PAD} fill="#34d399" fillOpacity={0.05} />
              <XAxis
                {...axisProps}
                type="number"
                dataKey="valuation"
                domain={DOMAIN}
                ticks={TICKS}
                allowDataOverflow
              />
              <YAxis
                {...axisProps}
                type="number"
                dataKey="quality"
                domain={DOMAIN}
                ticks={TICKS}
                allowDataOverflow
                width={28}
              />
              <ReferenceLine x={50} stroke="rgba(255,255,255,0.12)" />
              <ReferenceLine y={50} stroke="rgba(255,255,255,0.12)" />
              <Tooltip content={<QuadrantTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={peers} fill="#60a5fa">
                <LabelList dataKey="symbol" position="top" offset={6} style={{ fontSize: 10, fill: '#a1a1aa' }} />
              </Scatter>
              <Scatter data={self} fill="#34d399" shape="star">
                <LabelList dataKey="symbol" position="top" offset={6} style={{ fontSize: 10, fill: '#34d399' }} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  )
}
