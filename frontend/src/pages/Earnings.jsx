import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { useEarningsCalendar } from '../api/queries'
import { Pill } from '../components/RangePills'
import DayList from '../components/earnings/DayList'
import DayStrip from '../components/earnings/DayStrip'
import WeekGrid from '../components/earnings/WeekGrid'
import YourWeek from '../components/earnings/YourWeek'
import { Card, PageHeader } from '../components/ui'
import { buildWeekGrid, currentWeekLabel, groupByWeekday, weekLabel, weekdayKey } from '../lib/earnings'

const MIN_WEEK = -8
const MAX_WEEK = 12
const NAV_BUTTON =
  'w-11 h-11 md:w-6 md:h-6 rounded border border-white/[0.08] bg-[#0e0e11] text-zinc-400 hover:text-zinc-100 disabled:opacity-40 flex items-center justify-center'

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
      <PageHeader
        title="Earnings"
        subtitle="Your names first, then the US market week"
        right={
          <div className="flex items-center gap-1 bg-[#0e0e11] border border-white/[0.07] rounded-lg p-0.5">
            <Pill active={scope === 'all'} onClick={() => setScope('all')}>All</Pill>
            <Pill active={scope === 'mine'} onClick={() => setScope('mine')}>Mine</Pill>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        <button type="button" onClick={() => shiftWeek(-1)} disabled={week <= MIN_WEEK} aria-label="Previous week" className={NAV_BUTTON}>
          <ChevronLeft size={13} />
        </button>
        <span className="text-[var(--fig-sm)] num font-mono font-semibold text-zinc-200 md:min-w-[200px]">
          {weekLabel(data?.window)}
        </span>
        <button type="button" onClick={() => shiftWeek(1)} disabled={week >= MAX_WEEK} aria-label="Next week" className={NAV_BUTTON}>
          <ChevronRight size={13} />
        </button>
        {week !== 0 && (
          <button
            type="button"
            onClick={resetWeek}
            className="h-11 md:h-6 px-2 rounded border border-white/[0.08] bg-[#0e0e11] text-[var(--fig-xs)] text-zinc-400 hover:text-zinc-100"
          >
            {currentWeekLabel()}
          </button>
        )}
      </div>

      {isLoading && (
        <Card>
          <p className="text-[var(--fig-xs)] text-zinc-500">Loading…</p>
        </Card>
      )}

      {!isLoading && failed && (
        <Card>
          <p className="text-[var(--fig-sm)] text-red-400">Couldn’t load the earnings calendar.</p>
        </Card>
      )}

      {!isLoading && !failed && data && (
        <>
          <div className="md:hidden">
            <DayStrip days={grid.days} counts={counts} windowFrom={data.window?.from} selectedDay={day} onSelect={select} />
          </div>

          <YourWeek events={events} nextMine={data.next_mine} onOpen={openSymbol} />

          {scope === 'all' && data.stats && <p className="mb-2 text-[var(--fig-2xs)] text-zinc-500">{marketLine(data.stats)}</p>}

          <div className="hidden md:block">
            <WeekGrid grid={grid} windowFrom={data.window?.from} selectedDay={day} onSelect={select} onOpen={openSymbol} />
          </div>

          <DayList
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
