export const SAXO_DOT_CLASS = {
  emerald: 'bg-ok',
  amber: 'bg-warn',
  zinc: 'bg-ink-3',
}

export function deriveSaxoStatus(status) {
  if (!status) return null
  if (!status.connected) {
    return { kind: 'not_connected', tone: 'zinc', sentence: 'Saxo not connected' }
  }
  if (status.needs_reauth) {
    return { kind: 'needs_reauth', tone: 'amber', sentence: 'Saxo needs re-authentication' }
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
