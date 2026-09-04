import { useEffect, useState } from 'react'
import { connectSaxo } from '../api/client'
import { useSaxoStatus } from '../api/queries'
import { fmtClock } from '../lib/pricing'
import { Badge } from './ui'

export default function SaxoConnectionStatus() {
  const { data: status } = useSaxoStatus()
  const [error] = useState(
    () => new URLSearchParams(window.location.search).get('saxo') === 'error'
  )

  useEffect(() => {
    if (error) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [error])

  if (!status) return null

  if (!status.connected) {
    return (
      <div className="flex items-center gap-2">
        {error && <Badge tone="red">Connection failed</Badge>}
        <button
          onClick={connectSaxo}
          className="text-[12px] px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          Connect Saxo
        </button>
      </div>
    )
  }

  if (status.needs_reauth) {
    return (
      <button
        onClick={connectSaxo}
        className="text-[12px] px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
      >
        Reconnect Saxo
      </button>
    )
  }

  // Expired but still inside the reauth grace: calls are already being
  // refused, so saying "connected" here would contradict the panel below.
  if (!status.usable) {
    return (
      <Badge tone="amber">
        <span title={status.unusable_reason ?? undefined}>Reconnecting…</span>
      </Badge>
    )
  }

  return (
    <span className="flex items-center gap-2">
      {status.last_sync_outcome && status.last_sync_outcome !== 'ok' && (
        <Badge tone="amber">
          <span title={SYNC_OUTCOME_NOTE[status.last_sync_outcome]}>
            Sync {status.last_sync_outcome}
          </span>
        </Badge>
      )}
      <Badge tone="emerald">
        <span title={status.last_synced_at ? `Last synced ${fmtClock(status.last_synced_at)}` : 'Never synced'}>
          Saxo connected
        </span>
      </Badge>
    </span>
  )
}

// A connected account whose syncs are skipping looks healthy otherwise - that
// gap is what let stale data sit on the dashboard for six days.
const SYNC_OUTCOME_NOTE = {
  skipped: 'The last sync could not run, so this data may be stale',
  failed: 'The last sync failed, so this data may be stale',
}
