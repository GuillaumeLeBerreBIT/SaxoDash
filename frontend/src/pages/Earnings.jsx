import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEarningsCalendar } from '../api/queries'
import { Card, PageHeader } from '../components/ui'
import { Pill } from '../components/RangePills'
import { fmtCompact, fmtNum, fmtPct } from '../lib/format'
import { WEEKDAYS, groupByWeekday, weekLabel } from '../lib/earnings'

const SESSION = { bmo: 'BMO', amc: 'AMC', dmh: 'DMH' }
const MIN_WEEK = -8
const MAX_WEEK = 12

const bySize = (a, b) => (b.revenue_estimate ?? 0) - (a.revenue_estimate ?? 0)
const weekdayLabel = (key) => (WEEKDAYS.find(([k]) => k === key) || ['', key])[1]

function countTint(count) {
  if (!count) return 'rgba(255,255,255,0.03)'
  return `rgba(59,130,246,${Math.min(0.3, 0.04 + count * 0.02).toFixed(3)})`
}

function DayCard({ dayKey, label, events, selected, onSelect }) {
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
      <div className="mt-2 flex flex-wrap gap-1 min-h-[16px]">
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
  const up = surprise == null || surprise >= 0
  return (
    <span className="flex items-baseline gap-1.5 justify-end">
      <span className="text-[12px] num font-mono text-zinc-100">{fmtNum(event.eps_actual, 2)}</span>
      {surprise != null && (
        <span
          className={`text-[9.5px] num font-mono rounded-[3px] px-1 ${
            up ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
          }`}
        >
          {up ? '▲' : '▼'} {fmtPct(Math.abs(surprise), { sign: false, decimals: 1 })}
        </span>
      )}
      <span className="text-[9.5px] num font-mono text-zinc-600">est {fmtNum(event.eps_estimate, 2)}</span>
    </span>
  )
}

function EarningsRow({ event, onOpen }) {
  const reported = event.eps_actual != null
  const up = (event.eps_surprise_pct ?? 0) >= 0
  return (
    <button
      type="button"
      onClick={() => onOpen(event.symbol)}
      className="w-full grid items-center gap-2.5 h-11 pl-3 pr-3.5 text-left hover:bg-white/[0.045] transition-colors"
      style={{
        gridTemplateColumns: '92px 46px 88px minmax(0,1fr) 100px 16px',
        borderLeft: event.held
          ? '2px solid #3b82f6'
          : event.watched
            ? '2px solid rgba(59,130,246,0.4)'
            : '2px solid transparent',
        boxShadow: reported
          ? `inset 3px 0 0 ${up ? 'rgba(52,211,153,0.45)' : 'rgba(248,113,113,0.45)'}`
          : 'none',
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
          <span className="text-[9px]" style={{ color: event.held ? '#3b82f6' : '#52525b' }}>
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
      <span className="text-right">
        <EpsCell event={event} />
      </span>
      <span className="text-[11px] num font-mono text-zinc-500 text-right">
        {event.revenue_estimate == null ? '—' : fmtCompact(event.revenue_estimate / 1e6)}
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
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
  const [day, setDay] = useState('mon')

  const { data, isLoading, error } = useEarningsCalendar(scope, week)
  const failed = Boolean(error) || (data != null && data.ok === false)

  const groups = useMemo(() => (data?.events ? groupByWeekday(data.events) : {}), [data])
  const visibleDays = useMemo(
    () => WEEKDAYS.filter(([k], i) => i < 5 || (groups[k] && groups[k].length > 0)),
    [groups],
  )
  const rows = useMemo(() => [...(groups[day] || [])].sort(bySize), [groups, day])
  const bmo = rows.filter((e) => e.session === 'bmo')
  const afterClose = rows.filter((e) => e.session !== 'bmo')

  const openSymbol = (symbol) => navigate(`/research?symbol=${symbol}&tab=earnings`)
  const shiftWeek = (delta) => {
    setWeek((w) => Math.max(MIN_WEEK, Math.min(MAX_WEEK, w + delta)))
    setDay('mon')
  }

  const total = data?.events?.length ?? 0
  const mineCount = data?.events?.filter((e) => e.mine).length ?? 0
  const heaviest = visibleDays
    .map(([k, label]) => ({ label, n: (groups[k] || []).length }))
    .sort((a, b) => b.n - a.n)[0]
  const summary =
    scope === 'mine'
      ? `${total} on your lists this week`
      : `${total} report this week · ${mineCount} on your lists${
          heaviest && heaviest.n ? ` · heaviest ${heaviest.label} (${heaviest.n})` : ''
        }`

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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 6l-6 6 6 6" />
          </svg>
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        <span className="flex-1" />
        {!isLoading && !failed && <span className="text-[11.5px] text-zinc-500">{summary}</span>}
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
          <div
            className="grid gap-2.5 mb-4"
            style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0,1fr))` }}
          >
            {visibleDays.map(([k, label]) => (
              <DayCard
                key={k}
                dayKey={k}
                label={label}
                events={groups[k] || []}
                selected={day === k}
                onSelect={setDay}
              />
            ))}
          </div>

          <Card padding={false}>
            <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.06]">
              <span className="text-[13px] font-semibold text-zinc-100">
                {weekdayLabel(day)}
                <span className="text-zinc-600 font-normal"> · {rows.length} reporting</span>
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
                {bmo.length > 0 && <Section label="Before open" rows={bmo} onOpen={openSymbol} />}
                {afterClose.length > 0 && (
                  <Section label="After close" rows={afterClose} onOpen={openSymbol} divided={bmo.length > 0} />
                )}
              </>
            )}
          </Card>

          <p className="mt-2 text-[10px] text-zinc-600 flex flex-wrap gap-x-3.5 gap-y-1">
            <span>
              <span className="num text-emerald-400">▲</span>/<span className="num text-red-400">▼</span> EPS surprise
              vs. estimate
            </span>
            <span>tinted row = already reported</span>
            <span>grey = upcoming, estimate only</span>
            <span>blue bar = held / watchlist</span>
          </p>
        </>
      )}
    </div>
  )
}
