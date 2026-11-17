import { InstrumentLogo, LetterAvatar, Move } from '../ui'
import { fmtRevenue, moveLabel } from '../../lib/earnings'
import { resultWord } from '../../lib/earningsBrief'
import { fmtNum, fmtPct } from '../../lib/format'

const absPct = (v) => fmtPct(Math.abs(v), { sign: false, decimals: 1 })

const WORD_TONE = { up: 'text-up', down: 'text-down', flat: 'text-ink-2', warn: 'text-warn-text' }
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${absPct(v)}`

function Outcome({ result, children }) {
  return (
    <span className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
      <span className={`text-[13px] font-semibold ${WORD_TONE[result.tone]}`}>{result.word}</span>
      <span className="text-[12px] num text-ink-2">{children}</span>
    </span>
  )
}

export function EpsCell({ event }) {
  const result = resultWord(event)
  if (!result) return <span className="text-[13px] num text-ink-3">—</span>
  if (event.eps_actual == null) return <Outcome result={result}>{`expected ${fmtNum(event.eps_estimate, 2)}`}</Outcome>
  const versus = event.eps_estimate == null ? '' : ` vs ${fmtNum(event.eps_estimate, 2)}`
  const surprise = event.eps_surprise_pct == null ? '' : `, ${signed(event.eps_surprise_pct)}`
  return (
    <Outcome result={result}>
      {fmtNum(event.eps_actual, 2)}
      <span className="hidden md:inline">{`${versus}${surprise}`}</span>
    </Outcome>
  )
}

export function RevenueCell({ event }) {
  const { revenue_estimate: est, revenue_actual: act, revenue_surprise_pct: surprise } = event
  if (est == null && act == null) return <span className="text-[12px] text-ink-3">—</span>
  if (act == null) return <Outcome result={{ word: 'Due', tone: 'flat' }}>{`expected ${fmtRevenue(est)}`}</Outcome>
  const result = resultWord({ eps_actual: act, eps_surprise_pct: surprise })
  return <Outcome result={result}>{`${fmtRevenue(act)}${surprise == null ? '' : `, ${signed(surprise)}`}`}</Outcome>
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
        {event.name && <span title={event.name} className="text-[12px] text-ink-3 truncate">{event.name}</span>}
      </span>
    </span>
  )
}
