export const CHART_KEYS_HELP =
  'Left and right arrows step through the sessions, Home and End jump to the first and last, Shift with an arrow moves the window, plus and minus zoom, 0 returns to the latest bars and Escape clears the reading. With a drawing tool chosen, Enter places it at the session you are on; a ray takes a second Enter at its end. Tab reaches each drawn line and note: arrows move it, Shift moves it further, Enter edits its label and Delete removes it.'

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
  if (key === 'Enter') return { place: at }
  return null
}

const NUDGE_PX = 4
const BIG_NUDGE_PX = 20
const BIG_NUDGE_BARS = 5

export const NUDGE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

export function annotationKeyCommand({ key, shiftKey = false }, { movesInTime = true } = {}) {
  if (key === 'Enter') return { edit: true }
  if (key === 'ArrowUp') return { dy: -(shiftKey ? BIG_NUDGE_PX : NUDGE_PX) }
  if (key === 'ArrowDown') return { dy: shiftKey ? BIG_NUDGE_PX : NUDGE_PX }
  if (!movesInTime) return null
  if (key === 'ArrowLeft') return { dIndex: -(shiftKey ? BIG_NUDGE_BARS : 1) }
  if (key === 'ArrowRight') return { dIndex: shiftKey ? BIG_NUDGE_BARS : 1 }
  return null
}

export function showsKeyboardFocus(element) {
  try {
    return element.matches(':focus-visible')
  } catch {
    return true
  }
}

export function nudgePoint({ index, y }, { dIndex = 0, dy = 0 }, count) {
  return { index: Math.min(count - 1, Math.max(0, index + dIndex)), y: y + dy }
}
