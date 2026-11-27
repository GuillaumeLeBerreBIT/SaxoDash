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
  high52: ['52-week high', 'The highest price of the past year and how far below it today is'],
  band: ['Usual P/E range', 'The stock\'s own middle half of P/E over five years, drawn on each candle as zones. An indication of value, not a buy or sell signal. The research on it: stocks in the lower part of their usual range did worse than the average stock over the next 250 sessions, by 2.6% over the full history and 7.4% since 2023, graded worked against. Worked against means that return was negative after the flag fired, not that the flag pointed the right way. The upper part showed no clear edge.'],
  gaps: ['Volume gaps', 'Big opening gaps on heavy volume, until filled or 60 sessions pass'],
  plan: ['Stop-loss', 'A sell level below today\'s close, and what it would cost you'],
}

export function GuideMenuItems({ controls, available }) {
  return available.map((key) => (
    <MenuRow key={key} tall checked={Boolean(controls.guides?.[key])} onClick={() => controls.toggleGuide(key)}>
      <span className="block leading-5">{GUIDES[key][0]}</span>
      <span className="block text-[11px] leading-4 text-ink-3">{GUIDES[key][1]}</span>
    </MenuRow>
  ))
}
