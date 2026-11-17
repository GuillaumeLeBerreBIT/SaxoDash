import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { useEarningsCalendar } from '../api/queries'
import DayList from '../components/earnings/DayList'
import DayStrip from '../components/earnings/DayStrip'
import YourReports from '../components/earnings/YourReports'
import { Alert, Segmented, Skeleton } from '../components/ui'
import { buildWeekGrid, currentWeekLabel, groupByWeekday, weekLabel, weekdayKey } from '../lib/earnings'
import { earningsHeadline, marketSentence } from '../lib/earningsBrief'

const MIN_WEEK = -8
const MAX_WEEK = 12
const NAV_BUTTON =
  'sd-raised w-11 h-11 md:w-7 md:h-7 rounded-[7px] bg-raised text-ink-2 hover:text-ink disabled:opacity-40 flex items-center justify-center'
const SCOPES = [
  { value: 'all', label: 'Everyone' },
  { value: 'mine', label: 'Only mine' },
]

export default function Earnings() {
  const navigate = useNavigate()
  const [scope, setScope] = useState('all')
  const [week, setWeek] = useState(0)
  const [picked, setPicked] = useState(null)

  const { data, isLoading, error } = useEarningsCalendar(scope, week)
  const failed = Boolean(error) || (data != null && data.ok === false)
  const events = useMemo(() => data?.events || [], [data])

  const groups = useMemo(() => groupByWeekday(events), [events])
  const grid = useMemo(() => buildWeekGrid(events), [events])
  const counts = useMemo(
    () => Object.fromEntries(Object.entries(groups).map(([key, dayEvents]) => [key, dayEvents.length])),
    [groups],
  )
  const mineCounts = useMemo(
    () => Object.fromEntries(Object.entries(groups).map(([key, dayEvents]) => [key, dayEvents.filter((event) => event.mine).length])),
    [groups],
  )
  const mineEvents = useMemo(() => events.filter((event) => event.mine), [events])

  const autoDay = useMemo(() => {
    const wanted = week === 0 ? weekdayKey() : 'mon'
    if (groups[wanted]?.length) return wanted
    const firstBusy = grid.days.find(([key]) => groups[key]?.length)
    return firstBusy ? firstBusy[0] : wanted
  }, [week, groups, grid])
  const day = picked?.day ?? autoDay

  const openSymbol = useCallback((symbol) => navigate(`/research?symbol=${symbol}&tab=earnings`), [navigate])
  const select = useCallback((dayKey, session = null) => setPicked({ day: dayKey, session }), [])
  const shiftWeek = (delta) => {
    setWeek((w) => Math.max(MIN_WEEK, Math.min(MAX_WEEK, w + delta)))
    setPicked(null)
  }
  const resetWeek = () => {
    setWeek(0)
    setPicked(null)
  }

  return (
    <div>
      <h1 className="sr-only">Earnings</h1>

      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => shiftWeek(-1)} disabled={week <= MIN_WEEK} aria-label="Previous week" className={NAV_BUTTON}>
            <ChevronLeft size={14} />
          </button>
          <span className="text-[13.5px] num font-semibold text-ink md:min-w-[200px] text-center">{weekLabel(data?.window)}</span>
          <button type="button" onClick={() => shiftWeek(1)} disabled={week >= MAX_WEEK} aria-label="Next week" className={NAV_BUTTON}>
            <ChevronRight size={14} />
          </button>
          {week !== 0 && (
            <button
              type="button"
              onClick={resetWeek}
              className="sd-raised h-11 md:h-6 px-2.5 rounded-[7px] bg-raised text-[12px] font-semibold text-ink-2 hover:text-ink"
            >
              {currentWeekLabel()}
            </button>
          )}
        </div>
        <Segmented label="Universe" options={SCOPES} value={scope} onChange={setScope} />
      </div>

      {isLoading && (
        <div role="status" aria-label="Loading earnings" className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-12" />
          <Skeleton className="h-64" />
        </div>
      )}

      {!isLoading && failed && <Alert>Couldn’t load the earnings calendar.</Alert>}

      {!isLoading && !failed && data && (
        <>
          <section aria-label="This week" className="mb-5 flex flex-col gap-2.5 pt-2">
            <p data-testid="earnings-headline" className="max-w-[820px] text-[24px] font-bold leading-tight tracking-tight text-ink md:text-[32px] [text-wrap:balance]">
              {earningsHeadline(mineEvents, data.next_mine)}
            </p>
            {scope === 'all' && marketSentence(data.stats) ? (
              <p className="text-[15px] text-ink-2">{marketSentence(data.stats)}</p>
            ) : null}
          </section>
          <div className="mb-6">
            <YourReports events={events} onOpen={openSymbol} />
          </div>
          <DayStrip days={grid.days} counts={counts} mineCounts={mineCounts} windowFrom={data.window?.from} selectedDay={day} onSelect={select} />

          <DayList
            key={`${week}:${day}`}
            day={day}
            events={groups[day] || []}
            scope={scope}
            focusSession={picked?.session ?? null}
            onOpen={openSymbol}
            onViewAll={() => setScope('all')}
          />
        </>
      )}
    </div>
  )
}
