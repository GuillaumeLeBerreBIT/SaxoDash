import { memo, useEffect, useMemo, useRef } from 'react'
import { ChevronRight } from 'lucide-react'

import { Card, InfoTip } from '../ui'
import { REPORTED, withAlpha } from '../../lib/charts'
import { WEEKDAYS, eventKey, gridSessionKey, outcomeColor, rankEvents, splitBySession } from '../../lib/earnings'
import { fmtCompact } from '../../lib/format'
import { CompanyCell, EpsCell, MoveCell, RevenueCell } from './EarningsCells'

const ROW_GRID =
  'grid-cols-[minmax(0,1fr)_112px_64px_14px] md:grid-cols-[minmax(0,1.4fr)_72px_76px_minmax(0,1fr)_minmax(0,0.8fr)_80px_14px]'
const PHONE_HIDDEN = 'hidden md:block'
const weekdayLabel = (key) => (WEEKDAYS.find(([k]) => k === key) || ['', key])[1]

function edge(event) {
  const color = outcomeColor(event)
  return color ? `inset 3px 0 0 ${withAlpha(color, 0.45)}` : 'none'
}

const DayRow = memo(function DayRow({ event, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event.symbol)}
      className={`w-full grid items-center ${ROW_GRID} gap-2.5 h-12 pl-3 pr-3.5 text-left hover:bg-white/[0.045] transition-colors`}
      style={{
        borderLeft: `2px solid ${event.held ? REPORTED : event.watched ? withAlpha(REPORTED, 0.4) : 'transparent'}`,
        boxShadow: edge(event),
      }}
    >
      <CompanyCell event={event} />
      <span className={`${PHONE_HIDDEN} text-right text-[var(--fig-2xs)] num font-mono text-zinc-500`}>
        {event.market_cap == null ? '—' : fmtCompact(event.market_cap)}
      </span>
      <span className={`${PHONE_HIDDEN} pl-3 text-[var(--fig-2xs)] num font-mono text-zinc-600 whitespace-nowrap`}>
        {event.quarter ? `Q${event.quarter} ${event.year ?? ''}`.trim() : ''}
      </span>
      <span className="text-right">
        <EpsCell event={event} />
      </span>
      <span className={`${PHONE_HIDDEN} text-right`}>
        <RevenueCell event={event} />
      </span>
      <span className="text-right">
        <MoveCell event={event} />
      </span>
      <span className="text-zinc-600 flex">
        <ChevronRight size={14} />
      </span>
    </button>
  )
})

function ColumnHeader() {
  return (
    <div
      className={`grid items-center ${ROW_GRID} gap-2.5 pl-3 pr-3.5 py-1.5 border-b border-white/[0.06] text-[var(--fig-2xs)] uppercase tracking-[0.08em] text-zinc-600 whitespace-nowrap`}
      style={{ borderLeft: '2px solid transparent' }}
    >
      <span>Company</span>
      <span className={`${PHONE_HIDDEN} text-right`}>Mkt cap</span>
      <span className={`${PHONE_HIDDEN} pl-3`}>Qtr</span>
      <span className="text-right">EPS · est</span>
      <span className={`${PHONE_HIDDEN} text-right`}>Revenue</span>
      <span className="text-right">Move</span>
      <span />
    </div>
  )
}

export default function DayList({ day, events, scope, focusSession, onOpen, onViewAll }) {
  const sections = useMemo(() => splitBySession(rankEvents(events)), [events])
  const refs = useRef({})

  useEffect(() => {
    if (!focusSession) return
    const section = sections.find(({ key }) => gridSessionKey(key) === focusSession)
    const target = section && refs.current[section.key]
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [focusSession, day, sections])

  return (
    <Card padding={false}>
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.06]">
        <h2 className="flex items-center gap-1.5 text-[var(--fig-sm)] font-semibold text-zinc-100">
          {weekdayLabel(day)}
          <span className="text-zinc-600 font-normal"> · {events.length} reporting</span>
          <InfoTip>
            One row per company, your names first, then by market cap. A coloured left edge means it has
            reported: green beat consensus, red missed, blue in line; amber means the date has passed but no
            figure is posted yet. Move is the share price change across the report: 1d for a known session,
            2d when the time was not set.
          </InfoTip>
        </h2>
      </div>
      {events.length === 0 ? (
        <p className="px-4 py-9 text-center text-[var(--fig-sm)] text-zinc-500">
          {scope === 'mine' ? (
            <>
              Nothing on your lists reports this day.{' '}
              <button type="button" className="text-blue-400" onClick={onViewAll}>
                View all →
              </button>
            </>
          ) : (
            'No companies report this day.'
          )}
        </p>
      ) : (
        <>
          <ColumnHeader />
          {sections.map(({ key, label, rows }, i) => (
            <div key={key} role="group" aria-label={label} ref={(el) => (refs.current[key] = el)}>
              <div className={`px-3.5 pt-2.5 pb-1 text-[var(--fig-2xs)] uppercase tracking-[0.09em] text-zinc-600 ${i ? 'border-t border-white/[0.04]' : ''}`}>
                {label}
              </div>
              {rows.map((event) => (
                <DayRow key={eventKey(event)} event={event} onOpen={onOpen} />
              ))}
            </div>
          ))}
        </>
      )}
    </Card>
  )
}
