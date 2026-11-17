export const CHART_KEYS_HELP =
  'Left and right arrows step through the sessions, Home and End jump to the first and last, Shift with an arrow moves the window, plus and minus zoom, 0 returns to the latest bars and Escape clears the reading.'

const ZOOM_STEP = 1.25

export function chartKeyCommand({ key, shiftKey = false }, { hover, count, slots }) {
  if (count === 0) return null
  const last = count - 1
  const at = hover ?? last
  const panStep = Math.max(1, Math.round(slots / 4))
  if (key === 'ArrowLeft') return shiftKey ? { pan: panStep } : { hover: Math.max(0, at - 1) }
  if (key === 'ArrowRight') return shiftKey ? { pan: -panStep } : { hover: Math.min(last, at + 1) }
  if (key === 'Home') return { hover: 0 }
  if (key === 'End') return { hover: last }
  if (key === '+' || key === '=') return { zoom: Math.round(slots / ZOOM_STEP) }
  if (key === '-' || key === '_') return { zoom: Math.round(slots * ZOOM_STEP) }
  if (key === '0') return { reset: true }
  if (key === 'Escape') return { hover: null }
  return null
}
