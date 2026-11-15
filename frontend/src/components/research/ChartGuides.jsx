import { PAD_T } from '../../lib/chartGeometry'
import { fmtMoney } from '../../lib/format'

const TAG_HEIGHT = 18
const LABEL_ROOM = 22
const COMPACT_BELOW = 520
const ZONE_FONT = 12
const STOP_FONT = 11

function Tag({ x, y, anchor = 'start', fill, colors, size, children }) {
  const width = String(children).length * size * 0.6 + 10
  const left = anchor === 'end' ? x - width : x
  return (
    <g>
      <rect x={left} y={y - TAG_HEIGHT / 2} width={width} height={TAG_HEIGHT} rx="3" fill={colors.pane} opacity="0.9" />
      <text x={left + 5} y={y + size * 0.36} fill={fill} fontSize={size} fontWeight="700" className="num">
        {children}
      </text>
    </g>
  )
}

export function PriceZones({ zones, currency, geometry, colors }) {
  if (!zones) return null
  const top = PAD_T
  const floor = PAD_T + geometry.chartH
  const buy = geometry.scaleY(zones.buyBelow)
  const expensive = geometry.scaleY(zones.expensiveAbove)
  const buyShown = buy < floor - LABEL_ROOM
  const expensiveShown = expensive > top + LABEL_ROOM
  const buyPrice = fmtMoney(zones.buyBelow, currency)
  const expensivePrice = fmtMoney(zones.expensiveAbove, currency)
  const compact = geometry.chartW < COMPACT_BELOW
  const scope = compact ? '' : ' for this company'
  const buyLead = zones.buyable ? (compact ? 'BUY ZONE' : 'BUY ZONE · cheap') : 'CHEAP'
  const buyWords = `${buyLead}${scope} below ${buyPrice}`
  const expensiveWords = `EXPENSIVE${scope} above ${expensivePrice}`
  const cheapColor = zones.buyable ? colors.up : colors.axisCategory
  return (
    <g data-testid="price-zones" pointerEvents="none">
      {buy < floor ? (
        <g data-testid="buy-zone">
          <rect x={0} y={Math.max(top, buy)} width={geometry.chartW} height={floor - Math.max(top, buy)} fill={cheapColor} opacity="0.13" />
          {buy > top ? <line x1={0} x2={geometry.chartW} y1={buy} y2={buy} stroke={cheapColor} strokeWidth="1.2" /> : null}
        </g>
      ) : null}
      {expensive > top ? (
        <g data-testid="expensive-zone">
          <rect x={0} y={top} width={geometry.chartW} height={Math.min(floor, expensive) - top} fill={colors.warn} opacity="0.11" />
          {expensive < floor ? (
            <line x1={0} x2={geometry.chartW} y1={expensive} y2={expensive} stroke={colors.warn} strokeWidth="1.2" />
          ) : null}
        </g>
      ) : null}
      <Tag x={8} y={buyShown ? Math.min(floor - 12, Math.max(top, buy) + 13) : floor - 12} fill={cheapColor} colors={colors} size={ZONE_FONT}>
        {buyShown ? buyWords : `↓ ${buyWords}`}
      </Tag>
      <Tag x={8} y={expensiveShown ? Math.max(top + 12, Math.min(floor, expensive) - 13) : top + 12} fill={colors.warnText} colors={colors} size={ZONE_FONT}>
        {expensiveShown ? expensiveWords : `↑ ${expensiveWords}`}
      </Tag>
    </g>
  )
}

function stopWords(plan, compact) {
  const stop = fmtMoney(plan.stop.price, plan.currency)
  if (compact) return `Stop-loss ${stop}`
  return `Stop-loss ${stop} · ${Math.abs(plan.stopDistancePct).toFixed(1)}% below today's close`
}

export function StopGuide({ plan, data, geometry, colors }) {
  if (!plan || !data.length || data[data.length - 1].date !== plan.asOf) return null
  const y = geometry.scaleY(plan.stop.price)
  const floor = PAD_T + geometry.chartH
  if (y < PAD_T || y > floor) return null
  return (
    <g data-testid="stop-guide" pointerEvents="none">
      {plan.stop.source === 'atr' ? (
        <line x1={0} x2={geometry.chartW} y1={y} y2={y} stroke={colors.down} strokeWidth="1.2" strokeDasharray="6 4" />
      ) : null}
      <Tag anchor="end" x={geometry.chartW - 4} y={Math.min(floor - 10, y + 12)} fill={colors.down} colors={colors} size={STOP_FONT}>
        {stopWords(plan, geometry.chartW < COMPACT_BELOW)}
      </Tag>
    </g>
  )
}
