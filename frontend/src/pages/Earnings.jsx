import { useNavigate } from 'react-router-dom'

import { useEarningsCalendar, usePositions } from '../api/queries'
import { Card, PageHeader } from '../components/ui'
import { fmtNum, fmtPct } from '../lib/format'
import { BUCKET_ORDER, bucketEarnings } from '../lib/earnings'

const SESSION_LABEL = { bmo: 'BMO', amc: 'AMC', dmh: 'DMH' }
const ROW_DATE = { weekday: 'short', month: 'short', day: 'numeric' }
const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

function Row({ event, held, onOpen }) {
  const past = event.date < TODAY_ISO()
  return (
    <button
      type="button"
      onClick={() => onOpen(event.symbol)}
      className={`w-full grid items-center gap-3 px-4 h-12 text-left rounded hover:bg-white/[0.04] ${past ? 'opacity-60' : ''}`}
      style={{ gridTemplateColumns: '116px 64px 1fr 52px 96px' }}
    >
      <span className="text-[11.5px] num font-mono text-zinc-400">
        {new Date(event.date + 'T00:00:00').toLocaleDateString(undefined, ROW_DATE)}
      </span>
      <span className="text-[12.5px] font-medium text-zinc-100">{event.symbol}</span>
      <span className="text-[11px] text-zinc-500">{held ? <span className="text-blue-400">Held</span> : 'Watchlist'}</span>
      <span className="text-[10px] text-zinc-500">{SESSION_LABEL[event.session] || '—'}</span>
      <span className="text-[11.5px] num font-mono text-right">
        {event.eps_actual != null ? (
          <span className={event.eps_surprise_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {fmtNum(event.eps_actual, 2)}
            {event.eps_surprise_pct != null ? ` (${fmtPct(event.eps_surprise_pct, { decimals: 0 })})` : ''}
          </span>
        ) : (
          <span className="text-zinc-400">{fmtNum(event.eps_estimate, 2)}e</span>
        )}
      </span>
    </button>
  )
}

export default function Earnings() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useEarningsCalendar()
  const { data: positions = [] } = usePositions()
  const held = new Set(positions.map((p) => p.ticker))
  const openSymbol = (symbol) => navigate(`/research?symbol=${symbol}&tab=earnings`)

  const buckets = data ? bucketEarnings(data.events) : null
  const unavailable = data?.unavailable ?? []

  return (
    <div>
      <PageHeader
        title="Earnings"
        subtitle="Upcoming and recent reports across your holdings and watchlists"
      />

      {isLoading && (
        <Card><p className="text-[12px] text-zinc-500">Loading…</p></Card>
      )}

      {!isLoading && error && (
        <Card><p className="text-[12.5px] text-red-400">Couldn’t load the earnings calendar.</p></Card>
      )}

      {!isLoading && !error && data && data.events.length === 0 && (
        <Card>
          <p className="text-[12.5px] text-zinc-400">
            No earnings in the next 30 days across your holdings or watchlists.
          </p>
          {unavailable.length > 0 && (
            <p className="mt-2 text-[11px] text-zinc-600">Couldn’t load {unavailable.length} symbol(s).</p>
          )}
        </Card>
      )}

      {!isLoading && !error && buckets && data.events.length > 0 && (
        <div className="space-y-5">
          {BUCKET_ORDER.map(([key, label]) =>
            buckets[key].length ? (
              <section key={key}>
                <h2 className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1.5 px-4">{label}</h2>
                <Card padding={false}>
                  {buckets[key].map((event) => (
                    <Row
                      key={`${event.symbol}-${event.date}`}
                      event={event}
                      held={held.has(event.symbol)}
                      onOpen={openSymbol}
                    />
                  ))}
                </Card>
              </section>
            ) : null,
          )}
          {unavailable.length > 0 && (
            <p className="text-[11px] text-zinc-600 px-4">Couldn’t load {unavailable.length} symbol(s).</p>
          )}
        </div>
      )}
    </div>
  )
}
