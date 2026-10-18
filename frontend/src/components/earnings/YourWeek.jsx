import { Card } from '../ui'
import { eventKey, rankEvents, sessionWords, yourWeekTally } from '../../lib/earnings'
import { fmtDayMonth, fmtEur, fmtPct, pctToneClass } from '../../lib/format'
import { CompanyCell, EpsCell, MoveCell } from './EarningsCells'

const ROW_GRID =
  'grid-cols-[minmax(0,1fr)_88px_72px] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_64px_minmax(0,1fr)_80px_88px]'
const weekday = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' })

function headline({ count, reported, beat }) {
  const base = `${count} of yours report`
  return reported ? `${base} · ${reported} reported, ${beat} beat` : base
}

function QuietWeek({ nextMine }) {
  return (
    <p className="px-3.5 py-3 text-[var(--fig-sm)] text-zinc-500">
      None of yours report this week.
      {nextMine && ` Next: ${nextMine.symbol}, ${weekday(nextMine.date)} ${fmtDayMonth(nextMine.date)}`}
    </p>
  )
}

function YourRow({ event, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event.symbol)}
      className={`w-full grid items-center ${ROW_GRID} gap-2.5 h-12 px-3.5 text-left hover:bg-white/[0.045] transition-colors`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <CompanyCell event={event} />
        <span className={`text-[var(--fig-2xs)] ${event.held ? 'text-blue-500' : 'text-zinc-600'}`}>
          {event.held ? 'Held' : 'Watching'}
        </span>
      </span>
      <span className="hidden md:block text-[var(--fig-2xs)] text-zinc-400">
        {weekday(event.date)} · {sessionWords(event.session)}
      </span>
      <span className="hidden md:block text-right text-[var(--fig-2xs)] num font-mono text-zinc-400">
        {event.weight_pct == null ? '' : fmtPct(event.weight_pct, { sign: false, decimals: 1 })}
      </span>
      <span className="text-right">
        <EpsCell event={event} />
      </span>
      <span className="text-right">
        <MoveCell event={event} />
      </span>
      <span className={`hidden md:block text-right text-[var(--fig-2xs)] num font-mono ${pctToneClass(event.pnl_impact, 2)}`}>
        {event.pnl_impact == null ? '' : fmtEur(event.pnl_impact, { sign: true })}
      </span>
    </button>
  )
}

export default function YourWeek({ events, nextMine, onOpen }) {
  const mine = rankEvents(events.filter((event) => event.mine))
  const tally = yourWeekTally(events)
  return (
    <Card padding={false} className="mb-4">
      <div className="flex items-baseline justify-between gap-3 px-3.5 py-3 border-b border-white/[0.06]">
        <h2 className="text-[var(--fig-sm)] font-semibold text-zinc-100">Your week</h2>
        {mine.length > 0 && <span className="text-[var(--fig-2xs)] text-zinc-500">{headline(tally)}</span>}
      </div>
      {mine.length === 0 ? (
        <QuietWeek nextMine={nextMine} />
      ) : (
        mine.map((event) => <YourRow key={eventKey(event)} event={event} onOpen={onOpen} />)
      )}
    </Card>
  )
}
