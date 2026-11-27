import { useSearchParams } from 'react-router-dom'
import { useClearAccountHistory, useSaxoStatus } from '../api/queries'
import AccountSettings from '../components/settings/AccountSettings'
import { Button, Card, PageHeader, Segmented, StatusDot } from '../components/ui'
import { fmtDateTime } from '../lib/format'
import { deriveSaxoStatus } from '../lib/saxoStatus'
import { useConnectSaxo } from '../lib/useConnectSaxo'
import { BAND_COLOURS, THEMES, bandColour } from '../lib/theme'
import { useAppearance } from '../theme/ThemeProvider'

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'connections', label: 'Connections' },
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

const BAND_NAMES = { blue: 'Blue', orange: 'Orange', violet: 'Violet', yellow: 'Yellow', pink: 'Pink', teal: 'Teal' }

const bandOptions = (other) =>
  Object.keys(BAND_COLOURS)
    .filter((name) => name !== other)
    .map((name) => ({
      value: name,
      label: <><span aria-hidden="true" className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: bandColour(name, 'republic') }} />{BAND_NAMES[name]}</>,
    }))

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
]

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
  const { theme, moves, density, cheapBand, expensiveBand, setAppearance } = useAppearance()
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
      <h3 className="mt-6 mb-2 text-[15px] font-bold text-ink">Usual range zone colours</h3>
      <Segmented label="Lower part colour" options={bandOptions(expensiveBand)} value={cheapBand} onChange={(value) => setAppearance({ cheapBand: value })} />
      <p className="mt-2 mb-3 text-[12px] text-ink-3">Lower part: the price is at or below the low line of its usual range.</p>
      <Segmented label="Upper part colour" options={bandOptions(cheapBand)} value={expensiveBand} onChange={(value) => setAppearance({ expensiveBand: value })} />
      <p className="mt-2 text-[12px] text-ink-3">Upper part: the price is at or above the high line of its usual range.</p>
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

function saxoRow(status, failed, connect, connectFailed, clearHistory) {
  const derived = deriveSaxoStatus(status)
  if (!derived && failed) return { dot: 'warn', name: 'Saxo', note: 'Status unavailable' }
  if (!derived) return { dot: 'off', name: 'Saxo', note: 'Checking the connection…' }
  const synced = status.last_synced_at ? `last synced ${fmtDateTime(status.last_synced_at)}` : 'never synced'
  const base = 'Positions, prices, charts and performance'
  const clearAction = (
    <Button size="sm" disabled={clearHistory.isPending} onClick={() => clearHistory.mutate()}>
      {clearHistory.isPending ? 'Clearing…' : 'Clear account history'}
    </Button>
  )
  if (derived.kind === 'not_connected') {
    return { dot: 'off', name: 'Saxo not connected', note: connectFailed ? 'Connection failed' : base, action: <Button variant="primary" size="sm" onClick={connect}>Connect</Button> }
  }
  if (derived.kind === 'needs_reauth') {
    return {
      dot: 'warn',
      name: 'Saxo needs re-authentication',
      note: connectFailed ? 'Connection failed' : `${base}. The session lapsed; ${synced}.`,
      action: <Button variant="primary" size="sm" onClick={connect}>Reconnect</Button>,
    }
  }
  if (derived.kind === 'reconnecting') {
    return { dot: 'warn', name: 'Saxo reconnecting', note: status.unusable_reason ?? base }
  }
  const name = status.environment ? `Saxo · ${String(status.environment).toUpperCase()}` : 'Saxo'
  if (derived.kind === 'sync_degraded') {
    return { dot: 'warn', name, note: `${base}. Last sync ${derived.outcome}; ${synced}.`, action: clearAction }
  }
  return { dot: 'ok', name, note: `${base}. Connected; ${synced}.`, action: clearAction }
}

function Connections() {
  const { data: saxo, isError: saxoFailed } = useSaxoStatus()
  const { connect, failed: connectFailed } = useConnectSaxo()
  const clearHistory = useClearAccountHistory()
  const saxoSource = saxoRow(saxo, saxoFailed, connect, connectFailed, clearHistory)
  const dot = saxoSource.dot === 'warn' ? 'warn' : undefined
  return (
    <Card context="Where SaxoDash gets its numbers" dot={dot} title="Connections">
      <ul>
        <SourceRow {...saxoSource} />
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

function syncRows(saxo, failed) {
  if (failed) return [{ key: 'Saxo:unavailable', dot: 'warn', name: 'Saxo', note: 'Status unavailable' }]
  if (!saxo?.connected) return []
  const lastGood = saxo.last_synced_at ? fmtDateTime(saxo.last_synced_at) : 'never'
  const failing = saxo.failing_syncs ?? []
  if (failing.length) {
    return failing.map((task) => ({ key: `Saxo:${task}`, dot: 'warn', name: task, mono: true, note: `Saxo · failing · last good sync ${lastGood}` }))
  }
  const outcome = saxo.last_sync_outcome
  const degraded = outcome && outcome !== 'ok'
  return [{
    key: 'Saxo:sync',
    dot: degraded ? 'warn' : 'ok',
    name: 'Saxo sync',
    note: degraded ? `Last run ${outcome} · last good sync ${lastGood}` : `Last synced ${lastGood}`,
  }]
}

function SyncHealth() {
  const { data: saxo, isError: saxoFailed } = useSaxoStatus()
  const rows = syncRows(saxo, saxoFailed)
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

function ConnectionsAndSync() {
  return (
    <div className="flex flex-col gap-[var(--sd-gap,12px)]">
      <Connections />
      <SyncHealth />
    </div>
  )
}

const BODIES = { account: AccountSettings, appearance: Appearance, connections: ConnectionsAndSync, sync: ConnectionsAndSync }
const MENU_SECTION = { sync: 'connections' }

export default function Settings() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('section')
  const section = Object.hasOwn(BODIES, requested) ? requested : 'appearance'
  const Body = BODIES[section]
  const current = MENU_SECTION[section] ?? section
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
                    aria-current={item.id === current ? 'page' : undefined}
                    onClick={() => setParams({ section: item.id })}
                    className={`w-full text-left px-2 h-10 rounded-lg text-[14px] hover:bg-hover ${
                      item.id === current ? 'bg-selected font-bold text-ink' : 'font-medium text-ink-2'
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
