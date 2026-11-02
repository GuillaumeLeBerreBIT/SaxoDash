import { InstrumentLogo, LetterAvatar, Move } from '../ui'
import { surpriseSign } from '../../lib/charts'
import { fmtRevenue, moveLabel, reportStatus } from '../../lib/earnings'
import { fmtNum, fmtPct } from '../../lib/format'

const absPct = (v) => fmtPct(Math.abs(v), { sign: false, decimals: 1 })

export function SurpriseChip({ sign, children }) {
  const tone = sign > 0 ? 'text-up bg-up-subtle' : sign < 0 ? 'text-down bg-down-subtle' : 'text-ink-2 bg-pill'
  return (
    <span className={`text-[11px] font-semibold num rounded-[4px] px-1 whitespace-nowrap ${tone}`}>
      {sign > 0 ? '▲' : sign < 0 ? '▼' : '▬'} {children}
    </span>
  )
}

export function EpsCell({ event }) {
  if (event.eps_actual == null && event.eps_estimate == null) {
    return <span className="text-[13px] num text-ink-3">—</span>
  }
  if (event.eps_actual == null) {
    const pending = reportStatus(event) === 'pending'
    return (
      <span className={`text-[13px] num ${pending ? 'text-warn' : 'text-ink-2'}`}>
        {fmtNum(event.eps_estimate, 2)}
        <span className={pending ? 'text-warn' : 'text-ink-3'}>{pending ? ' pending' : 'e'}</span>
      </span>
    )
  }
  const surprise = event.eps_surprise_pct
  return (
    <span className="flex items-baseline gap-1.5 justify-end">
      <span className="text-[13px] num text-ink">{fmtNum(event.eps_actual, 2)}</span>
      {surprise != null && <SurpriseChip sign={surpriseSign(surprise)}>{absPct(surprise)}</SurpriseChip>}
      {event.eps_estimate != null && (
        <span className="hidden md:inline text-[12px] num text-ink-3">est {fmtNum(event.eps_estimate, 2)}</span>
      )}
    </span>
  )
}

export function RevenueCell({ event }) {
  const { revenue_estimate: est, revenue_actual: act, revenue_surprise_pct: surprise } = event
  if (est == null && act == null) return <span className="text-[12px] text-ink-3">—</span>
  if (act == null) {
    return (
      <span className="text-[12px] num text-ink-2">
        {fmtRevenue(est)}
        <span className="text-ink-3">e</span>
      </span>
    )
  }
  return (
    <span className="flex items-baseline gap-1.5 justify-end">
      <span className="text-[12px] num text-ink">{fmtRevenue(act)}</span>
      {surprise != null && <SurpriseChip sign={surpriseSign(surprise)}>{absPct(surprise)}</SurpriseChip>}
    </span>
  )
}

export function MoveCell({ event }) {
  const move = moveLabel(event)
  if (!move) return <span className="text-[12px] text-ink-3">—</span>
  return (
    <span className="flex items-baseline gap-1 justify-end">
      <Move value={event.move_pct} digits={1} className="text-[13px] font-semibold" />
      <span className="text-[12px] text-ink-3">{move.basis}</span>
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
          <span className={`text-[13.5px] font-semibold ${event.held ? 'text-held' : 'text-ink'}`}>{event.symbol}</span>
          {event.also?.length > 0 && <span className="text-[12px] text-ink-3">+{event.also.join(' +')}</span>}
        </span>
        {event.name && <span className="text-[12px] text-ink-3 truncate">{event.name}</span>}
      </span>
    </span>
  )
}
