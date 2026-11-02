import { Card, Tag } from '../ui'
import { eventKey, rankEvents, sessionWords, signTone, yourWeekTally } from '../../lib/earnings'
import { fmtDayMonth, fmtEur, fmtPct } from '../../lib/format'
import { CompanyCell, EpsCell, MoveCell } from './EarningsCells'

const ROW_GRID =
  'grid-cols-[minmax(0,1fr)_112px_64px] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_64px_minmax(0,1fr)_80px_88px]'
const weekday = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' })

function headline({ count, reported, beat }) {
  const base = `${count} of yours report`
  return reported ? `${base} · ${reported} reported, ${beat} beat` : base
}

function QuietWeek({ nextMine }) {
  return (
    <p className="px-[18px] py-3 text-[13.5px] text-ink-2">
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
      className={`w-full grid items-center ${ROW_GRID} gap-2.5 h-12 px-[18px] text-left hover:bg-hover transition-colors`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <CompanyCell event={event} />
        <Tag tone={event.held ? 'held' : 'neutral'} className="hidden md:inline-flex">
          {event.held ? 'Held' : 'Watching'}
        </Tag>
      </span>
      <span className="hidden md:block text-[12px] text-ink-2">
        {weekday(event.date)} · {sessionWords(event.session)}
      </span>
      <span className="hidden md:block text-right text-[12px] num text-ink-2">
        {event.weight_pct == null ? '' : fmtPct(event.weight_pct, { sign: false, decimals: 1 })}
      </span>
      <span className="text-right">
        <EpsCell event={event} />
      </span>
      <span className="text-right">
        <MoveCell event={event} />
      </span>
      <span className={`hidden md:block text-right text-[12px] num ${signTone(event.pnl_impact)}`}>
        {event.pnl_impact == null ? '' : fmtEur(event.pnl_impact, { sign: true })}
      </span>
    </button>
  )
}

export default function YourWeek({ events, nextMine, onOpen }) {
  const mine = rankEvents(events.filter((event) => event.mine))
  const tally = yourWeekTally(events)
  return (
    <Card
      flush
      dot="earn"
      context="Your holdings and watchlist"
      title="Your week"
      right={mine.length > 0 && <span className="text-[12px] text-ink-3">{headline(tally)}</span>}
      className="mb-4"
    >
      {mine.length === 0 ? (
        <QuietWeek nextMine={nextMine} />
      ) : (
        mine.map((event) => <YourRow key={eventKey(event)} event={event} onOpen={onOpen} />)
      )}
    </Card>
  )
}
