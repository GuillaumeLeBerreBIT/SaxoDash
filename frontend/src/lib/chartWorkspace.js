import { layoutById, resizeSlots } from './chartLayouts'
import { ADDED_LIMIT } from './compare'

const KEY = 'saxodash:chart-workspace'

function sanitizeSlot(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.symbol !== 'string' || raw.symbol === '') return null
  return {
    symbol: raw.symbol,
    uic: Number.isInteger(raw.uic) ? raw.uic : null,
    assetType: typeof raw.assetType === 'string' && raw.assetType ? raw.assetType : null,
  }
}

export const COMPARE_OFF = { on: false, sp500: false, sector: false, added: [], mainAs: 'candles' }

function sanitizeCompare(raw) {
  if (!raw || typeof raw !== 'object') return COMPARE_OFF
  const added = (Array.isArray(raw.added) ? raw.added : [])
    .map(sanitizeSlot)
    .filter((entry) => entry && entry.uic != null && entry.assetType)
    .slice(0, ADDED_LIMIT)
  return {
    on: raw.on === true,
    sp500: raw.sp500 === true,
    sector: raw.sector === true,
    added,
    mainAs: raw.mainAs === 'line' ? 'line' : 'candles',
  }
}

export function sanitizeWorkspace(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const preset = layoutById(source.layout)
  const slots = resizeSlots(Array.isArray(source.slots) ? source.slots.map(sanitizeSlot) : [], preset.panes)
  const active =
    Number.isInteger(source.active) && source.active >= 0 && source.active < preset.panes ? source.active : 0
  const storedCompares = Array.isArray(source.compares) ? source.compares : []
  const compares = slots.map((_, index) => sanitizeCompare(storedCompares[index]))
  return { layout: preset.id, slots, active, linked: source.linked === true, compares }
}

export function readWorkspace() {
  try {
    return sanitizeWorkspace(JSON.parse(localStorage.getItem(KEY)))
  } catch {
    return sanitizeWorkspace(null)
  }
}

export function writeWorkspace({ layout, slots, active, linked, compares }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ layout, slots, active, linked, compares }))
    return true
  } catch {
    return false
  }
}

export function sameSlot(a, b) {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.symbol === b.symbol && a.uic === b.uic && a.assetType === b.assetType
}

export function withActiveSlot(workspace, slot) {
  if (sameSlot(workspace.slots[workspace.active], slot)) return workspace
  const slots = workspace.slots.slice()
  slots[workspace.active] = slot
  return { ...workspace, slots }
}
