import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { connectEnableBanking } from '../api/client'
import { useEnableBankingStatus } from '../api/queries'
import { bankSyncBadge } from '../lib/bankSync'
import { Badge, Button } from './ui'

const BANK_LABELS = { kbc: 'KBC', argenta: 'Argenta' }

function OneBank({ bank, state, failed }) {
  const label = BANK_LABELS[bank]

  if (!state.connected) {
    return (
      <div className="flex items-center gap-2">
        {failed && <Badge tone="red">{label} connection failed</Badge>}
        <Button size="sm" onClick={() => connectEnableBanking(bank)}>
          Connect {label}
        </Button>
      </div>
    )
  }

  if (state.needs_reauth) {
    return (
      <Button size="sm" variant="danger" onClick={() => connectEnableBanking(bank)}>
        Reconnect {label}
      </Button>
    )
  }

  if (!state.usable) {
    return (
      <Badge tone="amber">
        <span title={state.unusable_reason ?? undefined}>{label} reconnecting…</span>
      </Badge>
    )
  }

  const badge = bankSyncBadge(state)

  return (
    <Badge tone={badge.tone}>
      <span title={badge.title}>
        {label} {badge.text}
      </span>
    </Badge>
  )
}

export default function EnableBankingConnectionStatus() {
  const { data: status } = useEnableBankingStatus()
  const [params, setParams] = useSearchParams()
  const [failedBank] = useState(() => (params.get('enablebanking') === 'error' ? params.get('bank') : null))
  const hasErrorParams = params.has('enablebanking') || params.has('bank')

  useEffect(() => {
    if (!hasErrorParams) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('enablebanking')
        next.delete('bank')
        return next
      },
      { replace: true },
    )
  }, [hasErrorParams, setParams])

  if (!status) return null

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {Object.entries(status).map(([bank, state]) => (
        <OneBank key={bank} bank={bank} state={state} failed={bank === failedBank} />
      ))}
    </span>
  )
}
