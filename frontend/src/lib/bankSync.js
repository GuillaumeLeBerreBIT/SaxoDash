const OUTCOME_BADGES = {
  skipped: { text: 'sync skipped', title: 'The last sync could not run, so this data may be stale' },
  failed: { text: 'sync failed', title: 'The last sync failed, so this data may be stale' },
}

export function bankSyncBadge(state) {
  const failing = state.failing_syncs?.length ? ` (failing: ${state.failing_syncs.join(', ')})` : ''
  const outcome = OUTCOME_BADGES[state.last_sync_outcome]

  if (!outcome) {
    const title = state.last_synced_at ? `Last synced ${state.last_synced_at}` : 'Never synced'
    return { tone: 'emerald', text: 'connected', title: `${title}${failing}` }
  }

  const lastGood = state.last_synced_at ? `last good sync ${state.last_synced_at}` : 'never synced'
  return { tone: 'amber', text: outcome.text, title: `${outcome.title} · ${lastGood}${failing}` }
}
