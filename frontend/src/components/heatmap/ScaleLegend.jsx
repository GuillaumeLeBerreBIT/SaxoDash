import { NEGATIVE, POSITIVE, withAlpha } from '../../lib/charts'

export default function ScaleLegend({ cap }) {
  return (
    <div className="flex items-center gap-1.5 text-[var(--fig-2xs)] text-zinc-500">
      <span>−{cap}%</span>
      <span
        className="w-16 h-2 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${withAlpha(NEGATIVE, 0.8)}, rgba(255,255,255,0.06), ${withAlpha(POSITIVE, 0.8)})`,
        }}
      />
      <span>+{cap}%</span>
    </div>
  )
}
