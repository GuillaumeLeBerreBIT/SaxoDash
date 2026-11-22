import { useEffect, useEffectEvent, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import { activeAfterResize, layoutById, resizeSlots } from '../../lib/chartLayouts'
import { COMPARE_OFF, readWorkspace, sameSlot, withActiveSlot, writeWorkspace } from '../../lib/chartWorkspace'

function sameView(a, b) {
  return Boolean(a) && a.key === b.key && sameSlot(a.slot, b.slot)
}

function initialState(hasSymbolParam) {
  const workspace = readWorkspace()
  const stored = workspace.slots[workspace.active]
  return { workspace, seen: null, restoreTo: !hasSymbolParam && stored ? stored : null }
}

export function useChartWorkspace({ symbol, instrument, selectSymbol }) {
  const location = useLocation()
  const [params] = useSearchParams()
  const hasSymbolParam = params.has('symbol')
  const [state, setState] = useState(() => initialState(hasSymbolParam))
  const { workspace, seen, restoreTo } = state

  const view = {
    key: location.key,
    slot: { symbol, uic: instrument?.uic ?? null, assetType: instrument?.assetType ?? null },
  }
  if ((hasSymbolParam || !restoreTo) && !sameView(seen, view)) {
    setState((previous) => ({ ...previous, seen: view, workspace: withActiveSlot(previous.workspace, view.slot) }))
  }

  const restore = useEffectEvent(() => {
    if (restoreTo) selectSymbol(restoreTo.symbol, { uic: restoreTo.uic, assetType: restoreTo.assetType })
  })
  useEffect(() => {
    restore()
  }, [])

  useEffect(() => {
    writeWorkspace(workspace)
  }, [workspace])

  const show = (slot) => {
    if (slot) selectSymbol(slot.symbol, { uic: slot.uic, assetType: slot.assetType })
  }

  const activate = (index) => {
    if (index === workspace.active) return
    setState((previous) => ({ ...previous, workspace: { ...previous.workspace, active: index } }))
    show(workspace.slots[index])
  }

  const setLayout = (id) => {
    const preset = layoutById(id)
    const slots = resizeSlots(workspace.slots, preset.panes)
    const compares = resizeSlots(workspace.compares, preset.panes).map((compare) => compare ?? COMPARE_OFF)
    const active = activeAfterResize(workspace.active, workspace.slots.length, slots)
    setState((previous) => ({ ...previous, workspace: { ...previous.workspace, layout: preset.id, slots, compares, active } }))
    if (active !== workspace.active) show(slots[active])
  }

  const setLinked = (next) =>
    setState((previous) => ({ ...previous, workspace: { ...previous.workspace, linked: next } }))

  const setCompare = (index, change) =>
    setState((previous) => {
      const compares = previous.workspace.compares.slice()
      compares[index] = { ...compares[index], ...change }
      return { ...previous, workspace: { ...previous.workspace, compares } }
    })

  return {
    layout: workspace.layout,
    compares: workspace.compares,
    setCompare,
    slots: workspace.slots,
    active: workspace.active,
    linked: workspace.linked,
    activate,
    setLayout,
    setLinked,
  }
}
