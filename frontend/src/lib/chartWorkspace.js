import { layoutById, resizeSlots } from './chartLayouts'

const KEY = 'saxodash:chart-workspace'

function sanitizeSlot(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.symbol !== 'string' || raw.symbol === '') return null
  return {
    symbol: raw.symbol,
    uic: Number.isInteger(raw.uic) ? raw.uic : null,
    assetType: typeof raw.assetType === 'string' && raw.assetType ? raw.assetType : null,
  }
}

export function sanitizeWorkspace(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const preset = layoutById(source.layout)
  const slots = resizeSlots(Array.isArray(source.slots) ? source.slots.map(sanitizeSlot) : [], preset.panes)
  const active =
    Number.isInteger(source.active) && source.active >= 0 && source.active < preset.panes ? source.active : 0
  return { layout: preset.id, slots, active }
}

export function readWorkspace() {
  try {
    return sanitizeWorkspace(JSON.parse(localStorage.getItem(KEY)))
  } catch {
    return sanitizeWorkspace(null)
  }
}

export function writeWorkspace({ layout, slots, active }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ layout, slots, active }))
    return true
  } catch {
    return false
  }
}

export function sameSlot(a, b) {
  return Boolean(a && b) && a.symbol === b.symbol && a.uic === b.uic && a.assetType === b.assetType
}

export function withActiveSlot(workspace, slot) {
  if (sameSlot(workspace.slots[workspace.active], slot)) return workspace
  const slots = workspace.slots.slice()
  slots[workspace.active] = slot
  return { ...workspace, slots }
}
