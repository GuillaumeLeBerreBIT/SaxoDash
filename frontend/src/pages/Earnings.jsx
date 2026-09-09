import { memo, useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEarningsCalendar } from '../api/queries'
import BulletBar from '../components/BulletBar'
import { Pill } from '../components/RangePills'
import SurpriseBars from '../components/research/SurpriseBars'
import { Card, InfoTip, PageHeader } from '../components/ui'
import { BEAT, MISS, REPORTED, surpriseSign, withAlpha } from '../lib/charts'
import { WEEKDAYS, groupByWeekday, weekLabel, weekdayKey } from '../lib/earnings'
import { fmtCompact, fmtNum, fmtPct } from '../lib/format'

const SESSION = { bmo: 'BMO', amc: 'AMC', dmh: 'DMH' }
const MIN_WEEK = -8
const MAX_WEEK = 12

// Row left-edge tint by outcome: miss / in line / beat. Keyed by sign + 1.
const EDGE = [withAlpha(MISS, 0.45), withAlpha(REPORTED, 0.45), withAlpha(BEAT, 0.45)]

const bySize = (a, b) => (b.revenue_estimate ?? 0) - (a.revenue_estimate ?? 0)
const weekdayLabel = (key) => (WEEKDAYS.find(([k]) => k === key) || ['', key])[1]
const shortWeekday = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })
const absPct = (v) => fmtPct(Math.abs(v), { sign: false, decimals: 1 })

function Chevron({ dir = 'right', size = 14, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

function SplitBar({ beat, missed, className = '' }) {
  const total = beat + missed
  if (!total) return <div className={`h-[3px] rounded-full bg-white/[0.06] ${className}`} />
  return (
    <div className={`h-[3px] rounded-full overflow-hidden flex ${className}`}>
      <span style={{ width: `${(beat / total) * 100}%`, background: BEAT }} />
      <span style={{ width: `${(missed / total) * 100}%`, background: MISS }} />
    </div>
  )
}

function SummaryTile({ label, value, tone = 'text-zinc-50', right, children }) {
  return (
    <Card className="!p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">{label}</span>
        {right}
      </div>
      {value != null && (
        <div className={`mt-1.5 text-[19px] font-semibold num font-mono tracking-tight ${tone}`}>{value}</div>
      )}
      {children && <div className="mt-2">{children}</div>}
    </Card>
  )
}

/** Week-level headline read off the backend's `stats`: how many report, the
 *  beat record so far, the average surprise, and the beat/miss net by day. */
function WeekSummary({ stats, scope }) {
  if (!stats) return null
  const { total, reported, beat, missed, inline, mine, avg_surprise: avg, by_day: byDay } = stats
  const mineScope = scope === 'mine'
  const avgTone = avg == null ? 'text-zinc-500' : avg >= 0 ? 'text-emerald-400' : 'text-red-400'
  const bars = (byDay || []).map((d) => ({ label: shortWeekday(d.date), value: d.beat - d.missed }))

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
      <SummaryTile label={mineScope ? 'On your lists' : 'Reporting'} value={total}>
        <div className="text-[11px] text-zinc-500">
          <span className="num font-mono text-zinc-300">{reported}</span> reported ·{' '}
          <span className="num font-mono text-zinc-300">{total - reported}</span> ahead
        </div>
      </SummaryTile>

      <SummaryTile label="Beat rate" value={reported ? `${beat}/${reported}` : '—'}>
        <SplitBar beat={beat} missed={missed} />
        <div className="mt-1.5 text-[11px] text-zinc-500">
          {missed} missed · {inline} in line
        </div>
      </SummaryTile>

      <SummaryTile label="Avg surprise" value={avg == null ? '—' : fmtPct(avg, { decimals: 1 })} tone={avgTone}>
        <div className="text-[11px] text-zinc-500">EPS vs. consensus</div>
      </SummaryTile>

      <SummaryTile
        label="Net by day"
        right={
          !mineScope && (
            <span className="text-[10px] num font-mono text-blue-400">{mine} on your lists</span>
          )
        }
      >
        {bars.some((b) => b.value !== 0) ? (
          <SurpriseBars data={bars} height={92} label="Net beats" format={(v) => (v > 0 ? `+${v}` : `${v}`)} />
        ) : (
          <div className="h-[92px] flex items-center text-[11px] text-zinc-600">Nothing reported yet</div>
        )}
      </SummaryTile>
    </div>
  )
}

function countTint(count) {
  if (!count) return 'rgba(255,255,255,0.03)'
  return `rgba(59,130,246,${Math.min(0.3, 0.04 + count * 0.02).toFixed(3)})`
}

function DayCard({ dayKey, label, events, beat = 0, missed = 0, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(dayKey)}
      className={`text-left rounded-lg border border-white/[0.06] p-2.5 transition-colors ${
        selected ? 'bg-[#15151a] border-b-2 border-b-blue-500' : 'bg-[#0e0e11] hover:bg-[#141418]'
      } ${events.length ? '' : 'opacity-40'}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-medium text-zinc-200">{label}</span>
        <span
          className="text-[11px] num font-mono font-semibold text-indigo-200 rounded-full px-1.5 min-w-[20px] text-center"
          style={{ background: countTint(events.length) }}
        >
          {events.length}
        </span>
      </div>
      <SplitBar beat={beat} missed={missed} className="mt-2" />
      <div className="mt-1.5 flex flex-wrap gap-1 min-h-[16px]">
        {events.slice(0, 3).map((e) => (
          <span key={e.symbol} className="text-[10px] num font-mono text-zinc-400 bg-white/[0.04] rounded-[3px] px-1.5">
            {e.symbol}
          </span>
        ))}
        {events.length > 3 && <span className="text-[10px] text-zinc-600 px-0.5">+{events.length - 3}</span>}
      </div>
    </button>
  )
}

/** ▲/▼/▬ surprise chip, coloured by `sign` (-1 / 0 / +1). */
function Chip({ sign, children }) {
  const tone =
    sign > 0
      ? 'text-emerald-400 bg-emerald-500/10'
      : sign < 0
        ? 'text-red-400 bg-red-500/10'
        : 'text-zinc-400 bg-white/[0.06]'
  return (
    <span className={`text-[9.5px] num font-mono rounded-[3px] px-1 ${tone}`}>
      {sign > 0 ? '▲' : sign < 0 ? '▼' : '▬'} {children}
    </span>
  )
}

function EpsCell({ event }) {
  if (event.eps_actual == null) {
    return (
      <span className="text-[12px] num font-mono text-zinc-400">
        {fmtNum(event.eps_estimate, 2)}
        <span className="text-zinc-600">e</span>
      </span>
    )
  }
  const surprise = event.eps_surprise_pct
  return (
    <span className="flex items-baseline gap-1.5 justify-end">
      <span className="text-[12px] num font-mono text-zinc-100">{fmtNum(event.eps_actual, 2)}</span>
      {surprise != null && <Chip sign={surpriseSign(surprise)}>{absPct(surprise)}</Chip>}
      {event.eps_estimate != null && (
        <span className="text-[9.5px] num font-mono text-zinc-600">est {fmtNum(event.eps_estimate, 2)}</span>
      )}
    </span>
  )
}

function RevenueCell({ event }) {
  const { revenue_estimate: est, revenue_actual: act, revenue_surprise_pct: surprise } = event
  if (est == null && act == null) return <span className="text-[11px] text-zinc-600">—</span>
  if (act == null) {
    return (
      <span className="text-[11px] num font-mono text-zinc-500">
        {fmtCompact(est / 1e6)}
        <span className="text-zinc-600">e</span>
      </span>
    )
  }
  return (
    <span className="flex items-baseline gap-1.5 justify-end">
      <span className="text-[11px] num font-mono text-zinc-300">{fmtCompact(act / 1e6)}</span>
      {surprise != null && <Chip sign={surpriseSign(surprise)}>{absPct(surprise)}</Chip>}
    </span>
  )
}

const ROW_GRID = '92px 40px 64px 64px minmax(0,1fr) 120px 14px'

const EarningsRow = memo(function EarningsRow({ event, onOpen }) {
  const reported = event.eps_actual != null
  return (
    <button
      type="button"
      onClick={() => onOpen(event.symbol)}
      className="w-full grid items-center gap-2.5 h-11 pl-3 pr-3.5 text-left hover:bg-white/[0.045] transition-colors"
      style={{
        gridTemplateColumns: ROW_GRID,
        borderLeft: `2px solid ${
          event.held ? REPORTED : event.watched ? withAlpha(REPORTED, 0.4) : 'transparent'
        }`,
        boxShadow: reported ? `inset 3px 0 0 ${EDGE[surpriseSign(event.eps_surprise_pct) + 1]}` : 'none',
      }}
    >
      <span className="flex flex-col leading-tight min-w-0">
        <span
          className={`text-[12.5px] num font-mono font-semibold truncate ${
            event.held ? 'text-blue-400' : 'text-zinc-100'
          }`}
        >
          {event.symbol}
        </span>
        {(event.held || event.watched) && (
          <span className={`text-[9px] ${event.held ? 'text-blue-500' : 'text-zinc-600'}`}>
            {event.held ? 'Held' : 'Watchlist'}
          </span>
        )}
      </span>
      <span className="text-[9.5px] text-zinc-500 bg-white/[0.04] rounded-[3px] py-0.5 text-center">
        {SESSION[event.session] || '—'}
      </span>
      <span className="text-[10px] num font-mono text-zinc-600">
        {event.quarter ? `Q${event.quarter} ${event.year ?? ''}`.trim() : ''}
      </span>
      <span className="flex justify-center">
        <BulletBar actual={event.eps_actual} estimate={event.eps_estimate} />
      </span>
      <span className="text-right">
        <EpsCell event={event} />
      </span>
      <span className="text-right">
        <RevenueCell event={event} />
      </span>
      <span className="text-zinc-600 flex">
        <Chevron />
      </span>
    </button>
  )
})

function ColumnHeader() {
  return (
    <div
      className="grid items-center gap-2.5 pl-3 pr-3.5 py-1.5 border-b border-white/[0.06] text-[9px] uppercase tracking-[0.08em] text-zinc-600"
      style={{ gridTemplateColumns: ROW_GRID, borderLeft: '2px solid transparent' }}
    >
      <span>Symbol</span>
      <span>Sess</span>
      <span>Qtr</span>
      <span className="flex justify-center items-center gap-1">
        vs est
        <InfoTip>
          The reported figure as a bar against the consensus estimate (the pale tick). Green beat, red
          missed, blue landed in line.
        </InfoTip>
      </span>
      <span className="text-right">EPS · est</span>
      <span className="text-right">Revenue</span>
      <span />
    </div>
  )
}

function Section({ label, rows, onOpen, divided }) {
  return (
    <>
      <div
        className={`px-3.5 pt-2.5 pb-1 text-[9px] uppercase tracking-[0.09em] text-zinc-600 ${
          divided ? 'border-t border-white/[0.04]' : ''
        }`}
      >
        {label}
      </div>
      {rows.map((e) => (
        <EarningsRow key={`${e.symbol}-${e.date}`} event={e} onOpen={onOpen} />
      ))}
    </>
  )
}

export default function Earnings() {
  const navigate = useNavigate()
  const [scope, setScope] = useState('all')
  const [week, setWeek] = useState(0)
  const [pickedDay, setPickedDay] = useState(null) // explicit click; null = follow the calendar

  const { data, isLoading, error } = useEarningsCalendar(scope, week)
  const failed = Boolean(error) || (data != null && data.ok === false)

  const groups = useMemo(() => (data?.events ? groupByWeekday(data.events) : {}), [data])
  const visibleDays = useMemo(
    () => WEEKDAYS.filter(([k], i) => i < 5 || (groups[k] && groups[k].length > 0)),
    [groups],
  )
  const splitByDate = useMemo(
    () => new Map((data?.stats?.by_day || []).map((d) => [d.date, d])),
    [data],
  )

  // Open on today's column (this week) or Monday (other weeks); if that day is
  // empty, fall back to the first day that has reports. Derived, not an effect.
  const autoDay = useMemo(() => {
    const wanted = week === 0 ? weekdayKey() : 'mon'
    if (groups[wanted]?.length) return wanted
    const firstBusy = visibleDays.find(([k]) => groups[k]?.length)
    return firstBusy ? firstBusy[0] : wanted
  }, [week, groups, visibleDays])
  const day = pickedDay ?? autoDay

  const rows = useMemo(() => [...(groups[day] || [])].sort(bySize), [groups, day])
  const { bmo, afterClose } = useMemo(() => {
    const b = []
    const a = []
    for (const e of rows) (e.session === 'bmo' ? b : a).push(e)
    return { bmo: b, afterClose: a }
  }, [rows])

  const openSymbol = useCallback(
    (symbol) => navigate(`/research?symbol=${symbol}&tab=earnings`),
    [navigate],
  )
  const shiftWeek = (delta) => {
    setWeek((w) => Math.max(MIN_WEEK, Math.min(MAX_WEEK, w + delta)))
    setPickedDay(null)
  }

  return (
    <div>
      <PageHeader
        title="Earnings"
        subtitle="Upcoming and recent US-market earnings, grouped by day"
        right={
          <div className="flex items-center gap-1 bg-[#0e0e11] border border-white/[0.07] rounded-lg p-0.5">
            <Pill active={scope === 'all'} onClick={() => setScope('all')}>All</Pill>
            <Pill active={scope === 'mine'} onClick={() => setScope('mine')}>Mine</Pill>
          </div>
        }
      />

      <div className="flex items-center gap-2.5 mb-3">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          disabled={week <= MIN_WEEK}
          aria-label="Previous week"
          className="w-6 h-6 rounded border border-white/[0.08] bg-[#0e0e11] text-zinc-400 hover:text-zinc-100 disabled:opacity-40 flex items-center justify-center"
        >
          <Chevron dir="left" size={13} />
        </button>
        <span className="text-[12.5px] num font-mono font-semibold text-zinc-200 min-w-[200px]">
          {weekLabel(data?.window)}
        </span>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          disabled={week >= MAX_WEEK}
          aria-label="Next week"
          className="w-6 h-6 rounded border border-white/[0.08] bg-[#0e0e11] text-zinc-400 hover:text-zinc-100 disabled:opacity-40 flex items-center justify-center"
        >
          <Chevron size={13} />
        </button>
      </div>

      {isLoading && (
        <Card>
          <p className="text-[12px] text-zinc-500">Loading…</p>
        </Card>
      )}

      {!isLoading && failed && (
        <Card>
          <p className="text-[12.5px] text-red-400">Couldn’t load the earnings calendar.</p>
        </Card>
      )}

      {!isLoading && !failed && data && (
        <>
          <WeekSummary stats={data.stats} scope={scope} />

          <div
            className="grid gap-2.5 mb-4"
            style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0,1fr))` }}
          >
            {visibleDays.map(([k, label]) => {
              const split = splitByDate.get(groups[k]?.[0]?.date)
              return (
                <DayCard
                  key={k}
                  dayKey={k}
                  label={label}
                  events={groups[k] || []}
                  beat={split?.beat ?? 0}
                  missed={split?.missed ?? 0}
                  selected={day === k}
                  onSelect={setPickedDay}
                />
              )
            })}
          </div>

          <Card padding={false}>
            <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.06]">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-100">
                {weekdayLabel(day)}
                <span className="text-zinc-600 font-normal"> · {rows.length} reporting</span>
                <InfoTip>
                  One row per company. A shaded row with a coloured left edge has reported — green beat
                  consensus, red missed, blue landed in line. Plain rows are upcoming and show the
                  estimate only (·e). ▲/▼ chips are the surprise vs. the estimate. A blue edge marks a
                  holding or watchlist name.
                </InfoTip>
              </span>
              <span className="text-[10.5px] text-zinc-500">
                Before open <span className="num font-mono text-zinc-400">{bmo.length}</span> · After close{' '}
                <span className="num font-mono text-zinc-400">{afterClose.length}</span>
              </span>
            </div>

            {rows.length === 0 ? (
              <p className="px-4 py-9 text-center text-[12.5px] text-zinc-500">
                {scope === 'mine' ? (
                  <>
                    Nothing on your lists reports this day.{' '}
                    <button type="button" className="text-blue-400" onClick={() => setScope('all')}>
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
                {bmo.length > 0 && <Section label="Before open" rows={bmo} onOpen={openSymbol} />}
                {afterClose.length > 0 && (
                  <Section label="After close" rows={afterClose} onOpen={openSymbol} divided={bmo.length > 0} />
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
