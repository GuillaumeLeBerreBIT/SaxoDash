import { InstrumentLogo, LetterAvatar } from '../ui'
import { surpriseSign } from '../../lib/charts'
import { fmtRevenue, moveLabel, reportStatus } from '../../lib/earnings'
import { fmtNum, fmtPct, pctToneClass } from '../../lib/format'

const absPct = (v) => fmtPct(Math.abs(v), { sign: false, decimals: 1 })

export function SurpriseChip({ sign, children }) {
  const tone =
    sign > 0
      ? 'text-emerald-400 bg-emerald-500/10'
      : sign < 0
        ? 'text-red-400 bg-red-500/10'
        : 'text-zinc-400 bg-white/[0.06]'
  return (
    <span className={`text-[var(--fig-2xs)] num font-mono rounded-[3px] px-1 whitespace-nowrap ${tone}`}>
      {sign > 0 ? '▲' : sign < 0 ? '▼' : '▬'} {children}
    </span>
  )
}

export function EpsCell({ event }) {
  if (event.eps_actual == null && event.eps_estimate == null) {
    return <span className="text-[var(--fig-xs)] num font-mono text-zinc-600">—</span>
  }
  if (event.eps_actual == null) {
    const pending = reportStatus(event) === 'pending'
    return (
      <span className={`text-[var(--fig-xs)] num font-mono ${pending ? 'text-amber-500' : 'text-zinc-400'}`}>
        {fmtNum(event.eps_estimate, 2)}
        <span className={pending ? 'text-amber-600' : 'text-zinc-600'}>{pending ? ' pending' : 'e'}</span>
      </span>
    )
  }
  const surprise = event.eps_surprise_pct
  return (
    <span className="flex items-baseline gap-1.5 justify-end">
      <span className="text-[var(--fig-xs)] num font-mono text-zinc-100">{fmtNum(event.eps_actual, 2)}</span>
      {surprise != null && <SurpriseChip sign={surpriseSign(surprise)}>{absPct(surprise)}</SurpriseChip>}
      {event.eps_estimate != null && (
        <span className="hidden md:inline text-[var(--fig-2xs)] num font-mono text-zinc-600">est {fmtNum(event.eps_estimate, 2)}</span>
      )}
    </span>
  )
}

export function RevenueCell({ event }) {
  const { revenue_estimate: est, revenue_actual: act, revenue_surprise_pct: surprise } = event
  if (est == null && act == null) return <span className="text-[var(--fig-2xs)] text-zinc-600">—</span>
  if (act == null) {
    return (
      <span className="text-[var(--fig-2xs)] num font-mono text-zinc-500">
        {fmtRevenue(est)}
        <span className="text-zinc-600">e</span>
      </span>
    )
  }
  return (
    <span className="flex items-baseline gap-1.5 justify-end">
      <span className="text-[var(--fig-2xs)] num font-mono text-zinc-300">{fmtRevenue(act)}</span>
      {surprise != null && <SurpriseChip sign={surpriseSign(surprise)}>{absPct(surprise)}</SurpriseChip>}
    </span>
  )
}

export function MoveCell({ event }) {
  const move = moveLabel(event)
  if (!move) return <span className="text-[var(--fig-2xs)] text-zinc-600">—</span>
  return (
    <span className="flex items-baseline gap-1 justify-end">
      <span className={`text-[var(--fig-xs)] num font-mono ${pctToneClass(event.move_pct, 1)}`}>{move.text}</span>
      <span className="text-[var(--fig-2xs)] text-zinc-600">{move.basis}</span>
    </span>
  )
}

export function CompanyCell({ event, size = 20 }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <InstrumentLogo
        symbol={event.symbol}
        size={size}
        className="rounded"
        fallback={<LetterAvatar symbol={event.symbol} size={size} />}
      />
      <span className="flex flex-col leading-tight min-w-0">
        <span className="flex items-baseline gap-1">
          <span className={`text-[var(--fig-sm)] num font-mono font-semibold ${event.held ? 'text-blue-400' : 'text-zinc-100'}`}>
            {event.symbol}
          </span>
          {event.also?.length > 0 && (
            <span className="text-[var(--fig-2xs)] num font-mono text-zinc-600">+{event.also.join(' +')}</span>
          )}
        </span>
        {event.name && <span className="text-[var(--fig-2xs)] text-zinc-500 truncate">{event.name}</span>}
      </span>
    </span>
  )
}
