import { performanceFill } from '../../lib/charts'
import { fmtPct, pctToneClass } from '../../lib/format'

const TINT_CAP = 40

export default function PerformanceTiles({ returns }) {
  if (!returns.some((row) => row.pct != null)) return null

  return (
    <ul className="grid grid-cols-3 gap-1">
      {returns.map(({ key, pct }) => (
        <li
          key={key}
          className="rounded px-1 py-1.5 text-center"
          style={{ backgroundColor: performanceFill(pct, { cap: TINT_CAP }) ?? undefined }}
        >
          <div className={`num font-mono text-[var(--fig-sm)] ${pctToneClass(pct)}`}>{fmtPct(pct)}</div>
          <div className="text-[var(--fig-2xs)] text-zinc-400">{key}</div>
        </li>
      ))}
    </ul>
  )
}
