import { useChartColors } from '../../theme/useChartColors'

function zoneRole(zone, lastPrice) {
  if (lastPrice == null) return { label: 'Zone', tone: 'accent' }
  if (zone.high < lastPrice) return { label: 'Support', tone: 'up' }
  if (zone.low > lastPrice) return { label: 'Resistance', tone: 'down' }
  return { label: 'In range', tone: 'warn' }
}

export default function ChartZones({ zones, geometry, lastPrice, selectedId, onSelect }) {
  const c = useChartColors()
  const half = geometry.slot / 2

  return zones.map((zone) => {
    const role = zoneRole(zone, lastPrice)
    const color = c[role.tone]
    const left = geometry.xAt(zone.x1) - half
    const right = geometry.xAt(zone.x2) + half
    const top = geometry.scaleY(zone.high)
    const bottom = geometry.scaleY(zone.low)
    const selected = zone.id === selectedId

    return (
      <g key={zone.id} data-testid={`chart-zone-${zone.id}`}>
        <rect
          x={left.toFixed(2)}
          y={top.toFixed(2)}
          width={(right - left).toFixed(2)}
          height={Math.max(1, bottom - top).toFixed(2)}
          fill={color}
          fillOpacity={0.14}
          stroke={color}
          strokeWidth={selected ? 2 : 1}
          strokeDasharray="4 3"
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(zone.id)
          }}
        />
        <text x={(left + 6).toFixed(2)} y={(top + 14).toFixed(2)} fill={color} fontSize={11} fontWeight={600} pointerEvents="none">
          {role.label}
        </text>
      </g>
    )
  })
}
