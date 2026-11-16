import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { useEarningsCalendar } from '../api/queries'
import DayList from '../components/earnings/DayList'
import DayStrip from '../components/earnings/DayStrip'
import YourWeek from '../components/earnings/YourWeek'
import { Alert, Segmented, Skeleton } from '../components/ui'
import { buildWeekGrid, currentWeekLabel, groupByWeekday, weekLabel, weekdayKey } from '../lib/earnings'

const MIN_WEEK = -8
const MAX_WEEK = 12
const NAV_BUTTON =
  'sd-raised w-11 h-11 md:w-7 md:h-7 rounded-[7px] bg-raised text-ink-2 hover:text-ink disabled:opacity-40 flex items-center justify-center'
const SCOPES = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
]

function marketLine({ total, reported, beat }) {
  const base = `${total} reporting`
  return reported ? `${base} · ${Math.round((beat / reported) * 100)}% of reported beat` : base
}

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
          <YourWeek events={events} nextMine={data.next_mine} onOpen={openSymbol} />

          {scope === 'all' && data.stats ? (
            <p className="mb-2 text-[12px] text-ink-3">This week: {marketLine(data.stats)}</p>
          ) : null}
          <DayStrip days={grid.days} counts={counts} windowFrom={data.window?.from} selectedDay={day} onSelect={select} />

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
