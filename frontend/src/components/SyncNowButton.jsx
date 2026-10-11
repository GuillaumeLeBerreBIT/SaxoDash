import { useSyncNow } from '../api/queries'
import { Alert, Button } from './ui'

export default function SyncNowButton() {
  const { syncNow, syncing, queueError, note } = useSyncNow()

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {note && <span className="text-zinc-500 text-[var(--fig-xs)]">{note}</span>}
      {queueError && (
        <span role="alert">
          <Alert>{queueError}</Alert>
        </span>
      )}
      <Button size="sm" onClick={syncNow} disabled={syncing}>
        {syncing ? 'Syncing…' : 'Sync now'}
      </Button>
    </span>
  )
}
