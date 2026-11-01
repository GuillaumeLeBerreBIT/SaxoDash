import { useSearchParams } from 'react-router-dom'
import { connectEnableBanking, connectSaxo } from '../api/client'
import { useEnableBankingStatus, useSaxoStatus } from '../api/queries'
import { Button, Card, PageHeader, Segmented, StatusDot } from '../components/ui'
import { fmtDateTime } from '../lib/format'
import { bankSyncBadge } from '../lib/bankSync'
import { deriveSaxoStatus } from '../lib/saxoStatus'
import { THEMES } from '../lib/theme'
import { useAppearance } from '../theme/ThemeProvider'

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'connections', label: 'Connections' },
  { id: 'sync', label: 'Sync health' },
]

const THEME_CARDS = [
  { id: 'republic', name: 'Republic', note: 'Warm graphite, white accent' },
  { id: 'blue', name: 'Graphite Blue', note: 'Cool graphite, blue accent' },
  { id: 'light', name: 'Porcelain', note: 'Light, blue accent' },
]

const MOVE_OPTIONS = [
  { value: 'green-red', label: <><span className="text-up">▲</span> Green / <span className="text-down">▼</span> red</> },
  { value: 'cvd', label: 'Blue / orange' },
]

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
]

const BANK_LABELS = { kbc: 'KBC', argenta: 'Argenta' }

const OTHER_SOURCES = [
  { name: 'Finnhub', note: 'Fundamentals, statements, filings and news, with a key set on the server' },
  { name: 'SEC EDGAR', note: '13F filings of the tracked funds, imported on a schedule' },
  { name: 'House Clerk', note: 'Congress trade reports, imported daily' },
]

function ThemeCard({ theme, active, onPick }) {
  const colors = THEMES[theme.id]
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onPick(theme.id)}
      className={`text-left rounded-xl p-2.5 bg-tile hover:bg-hover ${active ? 'outline outline-2 outline-focus' : ''}`}
    >
      <span
        aria-hidden="true"
        className="grid grid-cols-[1fr_2fr] grid-rows-2 gap-1 h-[72px] p-1.5 rounded-lg mb-2.5"
        style={{ background: colors.page }}
      >
        <i className="row-span-2 rounded" style={{ background: colors.pane }} />
        <i className="rounded" style={{ background: colors.pane }} />
        <i className="rounded flex items-end gap-1 p-1" style={{ background: colors.pane }}>
          <b className="block h-2 flex-1 rounded-sm" style={{ background: colors.accent }} />
          <b className="block h-2 w-3 rounded-sm" style={{ background: colors.up }} />
          <b className="block h-2 w-3 rounded-sm" style={{ background: colors.down }} />
        </i>
      </span>
      <span className="block text-[14px] font-bold text-ink">{theme.name}</span>
      <span className="block text-[12px] text-ink-3">{theme.note}</span>
    </button>
  )
}

function Appearance() {
  const { theme, moves, density, setAppearance } = useAppearance()
  return (
    <Card context="Changes colours only; layout stays the same" title="Theme">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
        {THEME_CARDS.map((card) => (
          <ThemeCard key={card.id} theme={card} active={theme === card.id} onPick={(id) => setAppearance({ theme: id })} />
        ))}
      </div>
      <h3 className="mt-6 mb-2 text-[15px] font-bold text-ink">Gain and loss colours</h3>
      <Segmented label="Gain and loss colours" options={MOVE_OPTIONS} value={moves} onChange={(value) => setAppearance({ moves: value })} />
      <p className="mt-2 text-[12px] text-ink-3">
        Blue and orange stay apart for red-green colour blindness. Arrows always carry the direction too.
      </p>
      <h3 className="mt-6 mb-2 text-[15px] font-bold text-ink">Density</h3>
      <Segmented label="Density" options={DENSITY_OPTIONS} value={density} onChange={(value) => setAppearance({ density: value })} />
    </Card>
  )
}

function SourceRow({ dot, name, note, action }) {
  return (
    <li className="flex items-center gap-3 py-3 border-b border-line last:border-b-0">
      {dot ? <StatusDot tone={dot} /> : <span className="w-[7px] shrink-0" />}
      <div className="min-w-0 grow">
        <b className="block text-[14px] text-ink">{name}</b>
        <span className="block text-[12px] text-ink-3">{note}</span>
      </div>
      {action}
    </li>
  )
}

function saxoRow(status) {
  const derived = deriveSaxoStatus(status)
  if (!derived) return { dot: 'off', name: 'Saxo', note: 'Checking the connection…' }
  const synced = status.last_synced_at ? `last synced ${fmtDateTime(status.last_synced_at)}` : 'never synced'
  const base = 'Positions, prices, charts and performance'
  if (derived.kind === 'not_connected') {
    return { dot: 'off', name: 'Saxo not connected', note: base, action: <Button variant="primary" size="sm" onClick={connectSaxo}>Connect</Button> }
  }
  if (derived.kind === 'needs_reauth') {
    return {
      dot: 'warn',
      name: 'Saxo needs re-authentication',
      note: `${base}. The session lapsed; ${synced}.`,
      action: <Button variant="primary" size="sm" onClick={connectSaxo}>Reconnect</Button>,
    }
  }
  if (derived.kind === 'reconnecting') {
    return { dot: 'warn', name: 'Saxo reconnecting', note: status.unusable_reason ?? base }
  }
  const name = status.environment ? `Saxo · ${String(status.environment).toUpperCase()}` : 'Saxo'
  if (derived.kind === 'sync_degraded') {
    return { dot: 'warn', name, note: `${base}. Last sync ${derived.outcome}; ${synced}.` }
  }
  return { dot: 'ok', name, note: `${base}. Connected; ${synced}.` }
}

function bankRow(bank, state) {
  const label = BANK_LABELS[bank] ?? bank
  if (!state.connected) {
    return {
      dot: 'off',
      name: `${label} not connected`,
      note: 'Account balances and transactions',
      action: <Button size="sm" onClick={() => connectEnableBanking(bank)}>Connect</Button>,
    }
  }
  if (state.needs_reauth) {
    return {
      dot: 'warn',
      name: `${label} needs re-authentication`,
      note: 'Account balances and transactions',
      action: <Button variant="primary" size="sm" onClick={() => connectEnableBanking(bank)}>Reconnect</Button>,
    }
  }
  if (!state.usable) return { dot: 'warn', name: `${label} reconnecting`, note: state.unusable_reason ?? 'Account balances and transactions' }
  const badge = bankSyncBadge(state)
  return { dot: badge.tone === 'emerald' ? 'ok' : 'warn', name: label, note: `Account balances and transactions. ${badge.title}` }
}

function Connections() {
  const { data: saxo } = useSaxoStatus()
  const { data: banks } = useEnableBankingStatus()
  const rows = [saxoRow(saxo), ...Object.entries(banks ?? {}).map(([bank, state]) => bankRow(bank, state))]
  const dot = rows.some((row) => row.dot === 'warn') ? 'warn' : undefined
  return (
    <Card context="Where SaxoDash gets its numbers" dot={dot} title="Connections">
      <ul>
        {rows.map((row) => (
          <SourceRow key={row.name} {...row} />
        ))}
      </ul>
      <h3 className="mt-5 mb-1 text-[13px] font-semibold text-ink-2">Other sources</h3>
      <ul>
        {OTHER_SOURCES.map((source) => (
          <SourceRow key={source.name} name={source.name} note={source.note} />
        ))}
      </ul>
    </Card>
  )
}

function syncRows(saxo, banks) {
  const rows = []
  const groups = [['Saxo', saxo], ...Object.entries(banks ?? {}).map(([bank, state]) => [BANK_LABELS[bank] ?? bank, state])]
  for (const [source, state] of groups) {
    if (!state?.connected) continue
    const lastGood = state.last_synced_at ? fmtDateTime(state.last_synced_at) : 'never'
    const failing = state.failing_syncs ?? []
    for (const task of failing) {
      rows.push({ key: `${source}:${task}`, dot: 'warn', name: task, mono: true, note: `${source} · failing · last good sync ${lastGood}` })
    }
    if (!failing.length) {
      const outcome = state.last_sync_outcome
      const degraded = outcome && outcome !== 'ok'
      rows.push({
        key: `${source}:sync`,
        dot: degraded ? 'warn' : 'ok',
        name: `${source} sync`,
        note: degraded ? `Last run ${outcome} · last good sync ${lastGood}` : `Last synced ${lastGood}`,
      })
    }
  }
  return rows
}

function SyncHealth() {
  const { data: saxo } = useSaxoStatus()
  const { data: banks } = useEnableBankingStatus()
  const rows = syncRows(saxo, banks)
  const dot = rows.some((row) => row.dot === 'warn') ? 'warn' : undefined
  return (
    <Card context="Latest run of each task" dot={dot} title="Sync health">
      {rows.length ? (
        <ul>
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 py-3 border-b border-line last:border-b-0">
              <StatusDot tone={row.dot} />
              <div className="min-w-0 grow">
                <b className={`block text-[14px] text-ink ${row.mono ? 'font-mono' : ''}`}>{row.name}</b>
                <span className="block text-[12px] text-ink-3">{row.note}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-ink-2">Nothing is connected, so nothing is syncing.</p>
      )}
    </Card>
  )
}

const BODIES = { appearance: Appearance, connections: Connections, sync: SyncHealth }

export default function Settings() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('section')
  const section = Object.hasOwn(BODIES, requested) ? requested : 'appearance'
  const Body = BODIES[section]
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-1 md:grid-cols-12 gap-[var(--sd-gap)]">
        <nav aria-label="Settings sections" className="md:col-span-3">
          <Card>
            <ul className="-mx-2">
              {SECTIONS.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={item.id === section ? 'page' : undefined}
                    onClick={() => setParams({ section: item.id })}
                    className={`w-full text-left px-2 h-10 rounded-lg text-[14px] hover:bg-hover ${
                      item.id === section ? 'bg-selected font-bold text-ink' : 'font-medium text-ink-2'
                    }`}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </nav>
        <div className="md:col-span-9 min-w-0">
          <Body />
        </div>
      </div>
      <p className="mt-6 text-[12px] text-ink-3">
        <a href="https://elbstream.com" target="_blank" rel="noreferrer" className="underline hover:text-ink">
          Logos by elbstream.com
        </a>
      </p>
    </>
  )
}
