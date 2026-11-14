import { overlayStrokes } from '../../lib/chartGeometry'
import { CHART_TYPES, OVERLAY_DEFS, PANE_DEFS } from '../../lib/chartOptions'
import { MenuLabel, MenuRow, MenuSeparator } from './menu'
import { useChartColors } from '../../theme/useChartColors'

export function ChartTypeMenuItems({ controls }) {
  return CHART_TYPES.map(([key, label]) => (
    <MenuRow key={key} checked={controls.type === key} onClick={() => controls.setType(key)}>
      {label}
    </MenuRow>
  ))
}

export function IndicatorMenuItems({ controls }) {
  const strokes = overlayStrokes(useChartColors())
  return (
    <>
      <MenuLabel>Overlays</MenuLabel>
      {OVERLAY_DEFS.map((overlay) => (
        <MenuRow
          key={overlay.key}
          checked={controls.overlays[overlay.key]}
          dot={strokes[overlay.key]}
          onClick={() => controls.toggleOverlay(overlay.key)}
        >
          {overlay.label}
        </MenuRow>
      ))}
      <MenuSeparator />
      <MenuLabel>Lower panes</MenuLabel>
      {PANE_DEFS.map((pane) => (
        <MenuRow key={pane.key} checked={controls.panes[pane.key]} onClick={() => controls.togglePane(pane.key)}>
          {pane.label}
        </MenuRow>
      ))}
    </>
  )
}

const GUIDES = {
  zones: ['Buy and expensive zones', 'Where the price is cheap or expensive for this company'],
  plan: ['Stop', 'Where the trade is wrong, and what you lose there'],
}

export function GuideMenuItems({ controls, available }) {
  return available.map((key) => (
    <MenuRow key={key} tall checked={Boolean(controls.guides?.[key])} onClick={() => controls.toggleGuide(key)}>
      <span className="block leading-5">{GUIDES[key][0]}</span>
      <span className="block text-[11px] leading-4 text-ink-3">{GUIDES[key][1]}</span>
    </MenuRow>
  ))
}
