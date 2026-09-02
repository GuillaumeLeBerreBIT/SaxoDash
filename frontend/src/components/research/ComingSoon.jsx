import { Clock } from 'lucide-react'

import { Card } from '../ui'

/** Marks a surface the Saxo API cannot fill.
 *
 *  Saxo serves prices, not fundamentals - no P/E, market cap, dividend yield,
 *  analyst ratings or macro series - so these panels wait on a second data
 *  provider rather than being filled with numbers the app cannot stand behind.
 */
export default function ComingSoon({ feature, height = 200 }) {
  return (
    <Card>
      <div
        className="flex flex-col items-center justify-center text-center gap-2 px-6"
        style={{ minHeight: height }}
      >
        <span className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-zinc-400">
          <Clock size={15} />
        </span>
        <div className="text-[13px] font-medium text-zinc-200">{feature} — coming soon</div>
        <p className="text-[12px] text-zinc-500 max-w-[42ch]">
          Saxo serves prices, not company fundamentals. This panel fills in once a fundamentals
          provider is chosen.
        </p>
      </div>
    </Card>
  )
}
