export function panelOffset(panelLeft, triggerRight) {
  if (panelLeft == null) return 8
  return Math.max(8, panelLeft - triggerRight)
}
