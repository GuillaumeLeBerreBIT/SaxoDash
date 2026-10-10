const BANK_LABELS = { kbc: 'KBC', argenta: 'Argenta' }

export function latestSyncedAt(status) {
  const stamps = Object.values(status ?? {})
    .map((bank) => bank.last_synced_at)
    .filter(Boolean)
    .sort()
  return stamps.length ? stamps[stamps.length - 1] : null
}

export function syncAdvanced(before, status) {
  const now = latestSyncedAt(status)
  return now !== null && (before === null || now > before)
}

export function syncOutcomeNote(status) {
  return Object.entries(status ?? {})
    .filter(([, bank]) => bank.connected && !bank.usable)
    .map(([key, bank]) => `${BANK_LABELS[key] ?? key}: ${bank.unusable_reason ?? 'not usable'}`)
    .join(' · ')
}
