import { PAD_T } from '../../lib/chartGeometry'
import { fmtEur, fmtMoney } from '../../lib/format'

const TAG_HEIGHT = 16
const TAG_CHAR = 6
const LABEL_ROOM = 20

function Tag({ x, y, anchor = 'start', fill, colors, children }) {
  const width = String(children).length * TAG_CHAR + 10
  const left = anchor === 'end' ? x - width : x
  return (
    <g>
      <rect x={left} y={y - TAG_HEIGHT / 2} width={width} height={TAG_HEIGHT} rx="3" fill={colors.pane} opacity="0.9" />
      <text x={left + 5} y={y + 3.6} fill={fill} fontSize="10" fontWeight="700" className="num">
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
  const buyWords = zones.buyable ? `BUY ZONE · cheap for this company below ${buyPrice}` : `CHEAP FOR THIS COMPANY below ${buyPrice}`
  return (
    <g data-testid="price-zones" pointerEvents="none">
      {buy < floor ? (
        <g data-testid="buy-zone">
          <rect x={0} y={Math.max(top, buy)} width={geometry.chartW} height={floor - Math.max(top, buy)} fill={colors.up} opacity="0.13" />
          {buy > top ? <line x1={0} x2={geometry.chartW} y1={buy} y2={buy} stroke={colors.up} strokeWidth="1.2" /> : null}
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
      <Tag x={8} y={buyShown ? Math.min(floor - 11, Math.max(top, buy) + 12) : floor - 11} fill={colors.up} colors={colors}>
        {buyShown ? buyWords : `↓ ${buyWords}`}
      </Tag>
      <Tag x={8} y={expensiveShown ? Math.max(top + 11, Math.min(floor, expensive) - 12) : top + 11} fill={colors.warn} colors={colors}>
        {expensiveShown ? `EXPENSIVE for this company above ${expensivePrice}` : `↑ EXPENSIVE for this company above ${expensivePrice}`}
      </Tag>
    </g>
  )
}

function stopWords(plan, compact) {
  const stop = fmtMoney(plan.stop.price, plan.currency)
  if (compact) return `STOP ${stop}`
  if (plan.size?.shares > 0) return `STOP ${stop} · lose ${fmtEur(plan.size.lossAtStop, { decimals: 0 })} with ${plan.size.shares} shares`
  return `STOP ${stop} · ${plan.stopDistancePct.toFixed(1)}%`
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
      <Tag anchor="end" x={geometry.chartW - 4} y={Math.min(floor - 10, y + 12)} fill={colors.down} colors={colors}>
        {stopWords(plan, geometry.chartW < 520)}
      </Tag>
    </g>
  )
}
