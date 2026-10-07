export const SAXO_DOT_CLASS = {
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
  zinc: 'bg-zinc-500',
}

export function deriveSaxoStatus(status) {
  if (!status) return null
  if (!status.connected) {
    return { kind: 'not_connected', tone: 'zinc', sentence: 'Saxo not connected' }
  }
  if (status.needs_reauth) {
    return { kind: 'needs_reauth', tone: 'red', sentence: 'Saxo needs reconnecting' }
  }
  if (!status.usable) {
    return { kind: 'reconnecting', tone: 'amber', sentence: 'Saxo reconnecting…' }
  }
  const outcome = status.last_sync_outcome
  if (outcome && outcome !== 'ok') {
    return { kind: 'sync_degraded', tone: 'amber', sentence: `Saxo connected, sync ${outcome}`, outcome }
  }
  return { kind: 'connected', tone: 'emerald', sentence: 'Saxo connected' }
}
