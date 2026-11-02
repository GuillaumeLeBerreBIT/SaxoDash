import { withAlpha } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'

export default function ScaleLegend({ cap }) {
  const c = useChartColors()
  return (
    <div className="flex items-center gap-1.5 text-[var(--fig-2xs)] text-ink-3">
      <span>−{cap}%</span>
      <span
        className="w-16 h-2 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${withAlpha(c.down, 0.8)}, ${c.heat[3]}, ${withAlpha(c.up, 0.8)})`,
        }}
      />
      <span>+{cap}%</span>
    </div>
  )
}
