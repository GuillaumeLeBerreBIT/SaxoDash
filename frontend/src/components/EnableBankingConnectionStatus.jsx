import { useEffect, useState } from 'react'
import { connectEnableBanking } from '../api/client'
import { useEnableBankingStatus } from '../api/queries'
import { Badge } from './ui'

const BANK_LABELS = { kbc: 'KBC', argenta: 'Argenta' }

// Same reasoning as SaxoConnectionStatus - a connected bank whose sync is
// quietly skipping or failing looks healthy otherwise.
const SYNC_OUTCOME_NOTE = {
  skipped: 'The last sync could not run, so this data may be stale',
  failed: 'The last sync failed, so this data may be stale',
}

function OneBank({ bank, state, failed }) {
  const label = BANK_LABELS[bank]

  if (!state.connected) {
    return (
      <div className="flex items-center gap-2">
        {failed && <Badge tone="red">{label} connection failed</Badge>}
        <button
          onClick={() => connectEnableBanking(bank)}
          className="text-[var(--fig-xs)] px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          Connect {label}
        </button>
      </div>
    )
  }

  if (state.needs_reauth) {
    return (
      <button
        onClick={() => connectEnableBanking(bank)}
        className="text-[var(--fig-xs)] px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
      >
        Reconnect {label}
      </button>
    )
  }

  if (!state.usable) {
    return (
      <Badge tone="amber">
        <span title={state.unusable_reason ?? undefined}>{label} reconnecting…</span>
      </Badge>
    )
  }

  return (
    <span className="flex items-center gap-2">
      {state.last_sync_outcome && state.last_sync_outcome !== 'ok' && (
        <Badge tone="amber">
          <span title={SYNC_OUTCOME_NOTE[state.last_sync_outcome]}>
            {label} sync {state.last_sync_outcome}
          </span>
        </Badge>
      )}
      <Badge tone="emerald">
        <span title={state.last_synced_at ? `Last synced ${state.last_synced_at}` : 'Never synced'}>
          {label} connected
        </span>
      </Badge>
    </span>
  )
}

export default function EnableBankingConnectionStatus() {
  const { data: status } = useEnableBankingStatus()
  const [failedBank] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('enablebanking') === 'error' ? params.get('bank') : null
  })

  useEffect(() => {
    if (failedBank) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [failedBank])

  if (!status) return null

  return (
    <span className="flex items-center gap-2">
      {Object.entries(status).map(([bank, state]) => (
        <OneBank key={bank} bank={bank} state={state} failed={bank === failedBank} />
      ))}
    </span>
  )
}
