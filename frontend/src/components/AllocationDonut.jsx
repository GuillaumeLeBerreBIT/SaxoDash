import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { chartTooltipProps } from '../lib/charts'
import { instrumentLogoUrl } from '../lib/logos'
import { useWidth } from '../lib/chartGeometry'

const MAX_OUTER_RADIUS = 112
const MIN_OUTER_RADIUS = 56
const RING_RATIO = 68 / 112 // inner/outer, preserved from the original ring
const RADIAN = Math.PI / 180
const CHART_MARGIN = 8
const LEADER_GAP = 12 // ring edge -> elbow
const LEADER_EXT = 18 // elbow -> horizontal end where the % sits
// Room the leader line + its "100%" text need beyond the ring, on each
// side - a radius derived from a narrow container (Portfolio's sidebar
// column) still has to leave the label inside the SVG's own bounds, or it
// gets clipped rather than just drawn smaller.
const LABEL_RESERVE = CHART_MARGIN + LEADER_GAP + LEADER_EXT + 26

/** Pie `label` slot for `showIcons`: the logo sits centered inside the
 *  slice (sized off the ring's own thickness, which recharts hands back
 *  here as `innerRadius`/`outerRadius` - the same values AllocationDonut
 *  derived from the container's measured width), and the percentage moves
 *  outside the ring on its own elbowed leader line - keeps the slice
 *  itself uncluttered while still labeling every slice directly (not
 *  color-only). `payload.logo === false` (the "Other" bucket, or anything
 *  without a real ticker) skips the icon. */
function SliceLabel({ cx, cy, midAngle, innerRadius, outerRadius, payload, percent }) {
  const ringThickness = outerRadius - innerRadius
  const iconRadius = innerRadius + ringThickness / 2
  const iconX = cx + iconRadius * Math.cos(-midAngle * RADIAN)
  const iconY = cy + iconRadius * Math.sin(-midAngle * RADIAN)
  const size = Math.round(ringThickness * 0.72)
  const showLogo = payload.logo !== false

  const cos = Math.cos(-midAngle * RADIAN)
  const sin = Math.sin(-midAngle * RADIAN)
  const sx = cx + outerRadius * cos
  const sy = cy + outerRadius * sin
  const mx = cx + (outerRadius + LEADER_GAP) * cos
  const my = cy + (outerRadius + LEADER_GAP) * sin
  const ex = mx + (cos >= 0 ? 1 : -1) * LEADER_EXT
  const textAnchor = cos >= 0 ? 'start' : 'end'

  return (
    <g>
      {showLogo && (
        <>
          <circle cx={iconX} cy={iconY} r={size / 2 + 2} fill="#fff" stroke="#3f3f46" strokeWidth={1} />
          <image
            href={instrumentLogoUrl(payload.name)}
            x={iconX - size / 2}
            y={iconY - size / 2}
            width={size}
            height={size}
            style={{ clipPath: 'circle(50%)' }}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      )}
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${my}`} stroke="#52525b" fill="none" strokeWidth={1} />
      <circle cx={ex} cy={my} r={1.5} fill="#71717a" stroke="none" />
      <text
        x={ex + (textAnchor === 'start' ? 4 : -4)}
        y={my}
        textAnchor={textAnchor}
        dominantBaseline="central"
        className="text-[11px] fill-zinc-400 num font-mono font-medium"
      >
        {(percent * 100).toFixed(0)}%
      </text>
    </g>
  )
}

/** Donut + colored-dot legend, shared by every "share of X" card (accounts,
 *  holdings, ...) so they render identically. `showIcons` additionally
 *  draws each slice's instrument logo + share directly on the ring - opt-in
 *  because it only makes sense where items are real instruments (not
 *  accounts), and only safe to enable now that callers cap slice count
 *  (see SliceLabel) instead of plotting every row. */
export default function AllocationDonut({ items, formatValue, showIcons = false, height = '320px' }) {
  const [containerRef, width] = useWidth()
  const total = items.reduce((sum, d) => sum + d.value, 0)

  // Icon-less donuts (account/sector breakdowns) draw no outward label, so
  // they can always use the full ring; only the leader-line labels need to
  // shrink the ring to fit a narrow column instead of running past it.
  const outerRadius = showIcons
    ? Math.min(MAX_OUTER_RADIUS, Math.max(MIN_OUTER_RADIUS, width / 2 - LABEL_RESERVE))
    : MAX_OUTER_RADIUS
  const innerRadius = outerRadius * RING_RATIO

  return (
    <>
      <div ref={containerRef} className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: CHART_MARGIN, right: CHART_MARGIN, bottom: CHART_MARGIN, left: CHART_MARGIN }}>
            <Pie
              data={items}
              dataKey="value"
              nameKey="name"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              stroke="#18181b"
              strokeWidth={2}
              isAnimationActive={false}
              label={showIcons ? SliceLabel : false}
              labelLine={false}
            >
              {items.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip {...chartTooltipProps} formatter={(v, n) => [formatValue(v), n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* showIcons already labels every slice (logo + % on its own leader
          line) and carries a hover tooltip, so a legend would just repeat
          it - only the icon-less donuts (account/sector breakdowns) need
          one to name their slices at all. */}
      {showIcons ? null : (
        <div className="grid grid-cols-1 gap-y-2 mt-3 pt-4 border-t border-zinc-800">
          {items.map((d, i) => {
            const pct = total > 0 ? (d.value / total) * 100 : 0
            return (
              <div key={i} className="flex items-center gap-2 text-[var(--fig-xs)]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="text-zinc-300 font-medium truncate">{d.name}</span>
                <span className="ml-auto text-zinc-500 num font-mono">{formatValue(d.value)}</span>
                <span className="text-zinc-600 num font-mono w-12 text-right">{pct.toFixed(1)}%</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
