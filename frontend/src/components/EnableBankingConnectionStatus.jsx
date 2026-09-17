import { connectEnableBanking } from '../api/client'
import { useEnableBankingStatus } from '../api/queries'
import { Badge } from './ui'

const BANK_LABELS = { kbc: 'KBC', argenta: 'Argenta' }

function OneBank({ bank, state }) {
  const label = BANK_LABELS[bank]

  if (!state.connected) {
    return (
      <button
        onClick={() => connectEnableBanking(bank)}
        className="text-[var(--fig-xs)] px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
      >
        Connect {label}
      </button>
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
    <Badge tone="emerald">
      <span title={state.last_synced_at ? `Last synced ${state.last_synced_at}` : 'Never synced'}>
        {label} connected
      </span>
    </Badge>
  )
}

export default function EnableBankingConnectionStatus() {
  const { data: status } = useEnableBankingStatus()
  if (!status) return null

  return (
    <span className="flex items-center gap-2">
      {Object.entries(status).map(([bank, state]) => (
        <OneBank key={bank} bank={bank} state={state} />
      ))}
    </span>
  )
}
