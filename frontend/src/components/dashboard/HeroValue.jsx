import { fmtEur, fmtPct } from '../../lib/format'
import { Card } from '../ui'

const PERIODS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['ytd', 'YTD'],
]

function DeltaPill({ label, delta }) {
  const known = delta && delta.pct != null
  const up = known && Number(delta.pct) >= 0
  return (
    <div className="flex flex-col">
      <span className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-600">{label}</span>
      <span
        className={`text-[var(--fig-sm)] num font-mono ${
          !known ? 'text-zinc-500' : up ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {!known ? '—' : fmtPct(delta.pct, { decimals: 2 })}
      </span>
      {known && (
        <span className="text-[var(--fig-2xs)] num font-mono text-zinc-600">
          {fmtEur(delta.abs, { sign: true, decimals: 0 })}
        </span>
      )}
    </div>
  )
}

export default function HeroValue({ value, change }) {
  return (
    <Card className="h-full flex flex-col">
      <div className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 font-medium">Net worth</div>
      <div className="mt-1 text-[clamp(22px,2.4vw,30px)] font-semibold tracking-tight num font-mono text-zinc-50">
        {fmtEur(value.net_worth)}
      </div>
      <div className="mt-1 text-[var(--fig-xs)] text-zinc-500 num font-mono">
        {fmtEur(value.portfolio)} invested · {fmtEur(value.bank)} bank
      </div>
      <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-2 gap-3">
        {PERIODS.map(([key, label]) => (
          <DeltaPill key={key} label={label} delta={change?.[key]} />
        ))}
      </div>
      <p className="mt-auto pt-3 text-[var(--fig-2xs)] text-zinc-600">
        Change is end-of-day, from the daily net-worth snapshot.
      </p>
    </Card>
  )
}
