export const CHART_LAYOUTS = [
  { id: '1', label: 'Single chart', panes: 1, columns: '1fr', rows: '1fr', tallPane: null },
  { id: '2h', label: 'Side by side', panes: 2, columns: '1fr 1fr', rows: '1fr', tallPane: null },
  { id: '2v', label: 'Stacked', panes: 2, columns: '1fr', rows: '1fr 1fr', tallPane: null },
  { id: '3', label: 'One large, two small', panes: 3, columns: '2fr 1fr', rows: '1fr 1fr', tallPane: 0 },
  { id: '4', label: 'Grid of four', panes: 4, columns: '1fr 1fr', rows: '1fr 1fr', tallPane: null },
]

export function layoutById(id) {
  return CHART_LAYOUTS.find((preset) => preset.id === id) ?? CHART_LAYOUTS[0]
}

export function resizeSlots(slots, count) {
  return Array.from({ length: count }, (_, index) => slots[index] ?? null)
}

export function activeAfterResize(active, previousCount, slots) {
  if (slots.length > previousCount) {
    const empty = slots.indexOf(null)
    if (empty !== -1) return empty
  }
  return Math.min(active, slots.length - 1)
}

export function gridStyle(preset) {
  return { gridTemplateColumns: preset.columns, gridTemplateRows: preset.rows }
}

export function paneStyle(preset, index) {
  return index === preset.tallPane ? { gridRow: 'span 2' } : undefined
}
