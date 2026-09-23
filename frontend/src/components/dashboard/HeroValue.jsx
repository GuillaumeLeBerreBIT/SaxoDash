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

/** A flat figure alongside the DeltaPill grid - "spent this month" isn't a
 *  gain/loss delta to compare against a prior period the way the others are,
 *  so it gets a plain value rather than a colored up/down pill. Folded in
 *  here instead of a standalone "This month's spending" Card - a single
 *  number with a label doesn't need its own bordered box, and the fuller
 *  breakdown already lives on the Spending page. */
function FlatStat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-600">{label}</span>
      <span className="text-[var(--fig-sm)] num font-mono text-zinc-300">{value}</span>
    </div>
  )
}

export default function HeroValue({ value, change, spendingThisMonth }) {
  // Saxo's cash balance wasn't usable when this total was computed - it
  // falls back to positions + bank, which excludes any uninvested Saxo
  // cash. Say so rather than showing it as if it were the precise figure.
  const approximate = value.net_worth_basis === 'approximate'
  return (
    <Card className="h-full flex flex-col">
      <div className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 font-medium">Net worth</div>
      <div className="mt-1 text-[clamp(22px,2.4vw,30px)] font-semibold tracking-tight num font-mono text-zinc-50">
        {approximate && (
          <span title="Saxo's cash balance is unavailable right now, so this excludes any uninvested Saxo cash">
            ≈{' '}
          </span>
        )}
        {fmtEur(value.net_worth)}
      </div>
      <div className="mt-1 text-[var(--fig-xs)] text-zinc-500 num font-mono">
        {fmtEur(value.portfolio)} invested · {fmtEur(value.bank)} bank
      </div>
      <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-2 gap-3">
        {PERIODS.map(([key, label]) => (
          <DeltaPill key={key} label={label} delta={change?.[key]} />
        ))}
        {spendingThisMonth != null && <FlatStat label="Spent MTD" value={fmtEur(spendingThisMonth)} />}
      </div>
      <p className="mt-auto pt-3 text-[var(--fig-2xs)] text-zinc-600">
        {approximate
          ? "Saxo's cash balance is unavailable right now - this total excludes any uninvested Saxo cash until it reconnects."
          : 'Change is end-of-day, from the daily net-worth snapshot.'}
      </p>
    </Card>
  )
}
