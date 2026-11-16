import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'

import { Card, InfoTip } from '../ui'
import { withAlpha } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'
import { GRID_SESSIONS, eventKey, gridSessionKey, outcomeColor, rankEvents, splitBySession, weekdayName } from '../../lib/earnings'
import { fmtCompact } from '../../lib/format'
import { CompanyCell, EpsCell, MoveCell, RevenueCell } from './EarningsCells'

const ROW_GRID =
  'grid-cols-[minmax(0,1fr)_112px_64px_14px] md:grid-cols-[minmax(0,1.4fr)_72px_76px_minmax(0,1fr)_minmax(0,0.8fr)_80px_14px]'
const PHONE_HIDDEN = 'hidden md:block'
const LARGEST_SHOWN = 15
const gridSessionLabel = (key) => (GRID_SESSIONS.find(([k]) => k === key) || ['', key])[1].toLowerCase()

function edge(event, colors) {
  const color = outcomeColor(event, colors)
  return color ? `inset 3px 0 0 ${withAlpha(color, 0.45)}` : 'none'
}

const DayRow = memo(function DayRow({ event, onOpen }) {
  const colors = useChartColors()
  return (
    <button
      type="button"
      onClick={() => onOpen(event.symbol)}
      className={`w-full grid items-center ${ROW_GRID} gap-2.5 h-12 pl-3 pr-[18px] text-left hover:bg-hover transition-colors`}
      style={{
        borderLeft: `2px solid ${event.held ? colors.primary : event.watched ? withAlpha(colors.primary, 0.4) : 'transparent'}`,
        boxShadow: edge(event, colors),
      }}
    >
      <CompanyCell event={event} />
      <span className={`${PHONE_HIDDEN} text-right text-[12px] num text-ink-2`}>
        {event.market_cap == null ? '—' : fmtCompact(event.market_cap)}
      </span>
      <span className={`${PHONE_HIDDEN} pl-3 text-[12px] num text-ink-3 whitespace-nowrap`}>
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
      <span className="text-ink-3 flex">
        <ChevronRight size={14} />
      </span>
    </button>
  )
})

function ColumnHeader() {
  return (
    <div
      className={`grid items-center ${ROW_GRID} gap-2.5 pl-3 pr-[18px] h-[30px] border-t border-line text-[12px] font-medium text-ink-3 whitespace-nowrap`}
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
  const [everyone, setEveryone] = useState(false)
  const ranked = useMemo(() => rankEvents(events), [events])
  const lead = useMemo(() => ranked.filter((event, index) => event.mine || index < LARGEST_SHOWN), [ranked])
  const smaller = ranked.length - lead.length
  const sections = useMemo(() => splitBySession(everyone ? ranked : lead), [everyone, ranked, lead])
  const refs = useRef({})

  useEffect(() => {
    if (!focusSession) return
    const section = sections.find(({ key }) => gridSessionKey(key) === focusSession)
    const target = section && refs.current[section.key]
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSession, day])

  const title = focusSession ? `${weekdayName(day)}, ${gridSessionLabel(focusSession)}` : weekdayName(day)
  return (
    <Card
      flush
      context={`${events.length} reporting`}
      title={title}
      right={
        <InfoTip>
          One row per company, your names first, then by market cap. A coloured left edge means it has
          reported: the up colour beat consensus, the down colour missed, the flat colour in line; the warning
          colour means the date has passed but no figure is posted yet. Move is the share price change across
          the report: 1d for a known session, 2d when the time was not set.
        </InfoTip>
      }
    >
      {events.length === 0 ? (
        <p className="px-[18px] py-9 text-center text-[13.5px] text-ink-2">
          {scope === 'mine' ? (
            <>
              Nothing on your lists reports this day.{' '}
              <button type="button" className="font-semibold text-ink underline underline-offset-2" onClick={onViewAll}>
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
              <div className={`px-[18px] pt-2.5 pb-1 text-[12px] font-semibold text-ink-2 ${i ? 'border-t border-line' : ''}`}>
                {label}
              </div>
              {rows.map((event) => (
                <DayRow key={eventKey(event)} event={event} onOpen={onOpen} />
              ))}
            </div>
          ))}
          {smaller > 0 && (
            <button
              type="button"
              aria-expanded={everyone}
              onClick={() => setEveryone((open) => !open)}
              className="w-full h-11 border-t border-line text-[13px] font-semibold text-ink-2 hover:text-ink hover:bg-hover"
            >
              {everyone ? 'Show the largest only' : `Show ${smaller} smaller ${smaller === 1 ? 'company' : 'companies'}`}
            </button>
          )}
        </>
      )}
    </Card>
  )
}
