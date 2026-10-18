import { InstrumentLogo, LetterAvatar } from '../ui'
import { dayDate, eventKey, outcome, outcomeColor } from '../../lib/earnings'

export const CELL_LIMIT = 6
function LogoTile({ event, onOpen }) {
  return (
    <button
      type="button"
      aria-label={[`Open ${event.symbol}`, outcome(event)].filter(Boolean).join(', ')}
      title={[event.symbol, event.name, outcome(event)].filter(Boolean).join(' · ')}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(event.symbol)
      }}
      className={`relative w-8 h-8 rounded-md bg-[#141418] border flex items-center justify-center overflow-hidden ${
        event.mine ? 'border-blue-500/60' : 'border-white/[0.06]'
      }`}
      style={{ boxShadow: `inset 0 -2px 0 ${outcomeColor(event) ?? 'transparent'}` }}
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
  return (
    <div
      aria-label={`${dayLabel} ${sessionLabel.toLowerCase()}: ${events.length} reporting`}
      onClick={() => events.length && onSelect(dayKey, sessionKey)}
      className={`relative min-h-[84px] rounded-lg border p-2 ${
        selected ? 'bg-[#15151a] border-blue-500/40' : 'bg-[#0e0e11] border-white/[0.06]'
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
          className="absolute top-1.5 right-2 text-[var(--fig-2xs)] num font-mono text-zinc-500 hover:text-zinc-100"
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
            className="h-8 px-1.5 rounded-md text-[var(--fig-2xs)] num font-mono text-zinc-400 bg-white/[0.04] hover:text-zinc-100"
          >
            +{rest} more
          </button>
        )}
      </div>
    </div>
  )
}

export default function WeekGrid({ grid, windowFrom, selectedDay, onSelect, onOpen }) {
  const { days, sessions, cells } = grid
  const columns = `120px repeat(${days.length}, minmax(0,1fr))`
  return (
    <div className="mb-4">
      <div className="grid gap-2" style={{ gridTemplateColumns: columns }}>
        <span />
        {days.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={selectedDay === key}
            onClick={() => onSelect(key, null)}
            className={`text-left text-[var(--fig-sm)] font-medium pb-1 border-b-2 ${
              selectedDay === key ? 'text-zinc-100 border-blue-500' : 'text-zinc-400 border-transparent hover:text-zinc-200'
            }`}
          >
            {label} {dayDate(windowFrom, key)}
          </button>
        ))}
        {sessions.map(([sessionKey, sessionLabel]) => (
          <div key={sessionKey} className="contents">
            <span className="self-center text-[var(--fig-2xs)] uppercase tracking-[0.08em] text-zinc-600">{sessionLabel}</span>
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
