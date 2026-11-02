import { InstrumentLogo, LetterAvatar } from '../ui'
import { useChartColors } from '../../theme/useChartColors'
import { dayDate, eventKey, outcome, outcomeColor } from '../../lib/earnings'

export const CELL_LIMIT = 6
function yoursCaption(events) {
  const mine = events.filter((event) => event.mine)
  if (mine.length === 0) return null
  return mine.length === 1 ? `${mine[0].name || mine[0].symbol}, yours` : `${mine.length} yours`
}

function LogoTile({ event, onOpen }) {
  const colors = useChartColors()
  return (
    <button
      type="button"
      aria-label={[`Open ${event.symbol}`, outcome(event)].filter(Boolean).join(', ')}
      title={[event.symbol, event.name, outcome(event)].filter(Boolean).join(' · ')}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(event.symbol)
      }}
      className={`relative w-8 h-8 rounded-md bg-raised flex items-center justify-center overflow-hidden ${
        event.mine ? 'ring-1 ring-earn' : ''
      }`}
      style={{ boxShadow: `inset 0 -2px 0 ${outcomeColor(event, colors) ?? 'transparent'}` }}
    >
      <InstrumentLogo
        symbol={event.symbol}
        size={22}
        className="rounded-sm"
        fallback={<LetterAvatar symbol={event.symbol} size={22} chars={2} className="rounded-sm" />}
      />
    </button>
  )
}

function Cell({ dayKey, dayLabel, sessionKey, sessionLabel, events, selected, onSelect, onOpen }) {
  const shown = events.slice(0, CELL_LIMIT)
  const rest = events.length - shown.length
  const yours = yoursCaption(events)
  return (
    <div
      aria-label={`${dayLabel} ${sessionLabel.toLowerCase()}: ${events.length} reporting${yours ? `, ${yours}` : ''}`}
      onClick={() => events.length && onSelect(dayKey, sessionKey)}
      className={`relative min-h-[84px] rounded-[10px] p-2 ${yours ? 'bg-earn-subtle' : 'bg-tile'} ${
        selected ? 'shadow-[inset_0_0_0_1.5px_var(--sd-ink)]' : ''
      } ${events.length ? 'cursor-pointer' : 'opacity-40'}`}
    >
      {events.length > 0 && (
        <button
          type="button"
          aria-label={`Show ${dayLabel} ${sessionLabel.toLowerCase()}`}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(dayKey, sessionKey)
          }}
          className="absolute top-1.5 right-2 text-[12px] font-semibold num text-ink-2 hover:text-ink"
        >
          {events.length}
        </button>
      )}
      <div className="flex flex-wrap gap-1.5 pr-5">
        {shown.map((event) => (
          <LogoTile key={eventKey(event)} event={event} onOpen={onOpen} />
        ))}
        {rest > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(dayKey, sessionKey)
            }}
            className="h-8 px-1.5 rounded-md text-[12px] num text-ink-2 bg-pill hover:text-ink"
          >
            +{rest} more
          </button>
        )}
      </div>
      {yours && <div className="mt-1.5 pr-5 truncate text-[12px] font-medium text-earn">{yours}</div>}
    </div>
  )
}

export default function WeekGrid({ grid, windowFrom, selectedDay, onSelect, onOpen }) {
  const { days, sessions, cells } = grid
  const columns = `120px repeat(${days.length}, minmax(0,1fr))`
  return (
    <div className="overflow-x-auto">
      <div className="grid gap-1.5 min-w-[620px]" style={{ gridTemplateColumns: columns }}>
        <span />
        {days.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={selectedDay === key}
            onClick={() => onSelect(key, null)}
            className={`text-left text-[13px] font-bold pb-1 border-b-2 ${
              selectedDay === key ? 'text-ink border-ink' : 'text-ink-2 border-transparent hover:text-ink'
            }`}
          >
            {label} {dayDate(windowFrom, key)}
          </button>
        ))}
        {sessions.map(([sessionKey, sessionLabel]) => (
          <div key={sessionKey} className="contents">
            <span className="self-center text-[12px] text-ink-2">{sessionLabel}</span>
            {days.map(([dayKey, dayLabel]) => (
              <Cell
                key={dayKey}
                dayKey={dayKey}
                dayLabel={dayLabel}
                sessionKey={sessionKey}
                sessionLabel={sessionLabel}
                events={cells[sessionKey][dayKey]}
                selected={selectedDay === dayKey}
                onSelect={onSelect}
                onOpen={onOpen}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
