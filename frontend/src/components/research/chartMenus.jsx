import { overlayStrokes } from '../../lib/chartGeometry'
import { CHART_TYPES, OVERLAY_DEFS, PANE_DEFS } from '../../lib/chartOptions'
import { GRADE_WORDS, evidenceLine, groupedByGrade } from '../../lib/signals'
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

export function SignalMenuItems({ controls, signals }) {
  return groupedByGrade(signals).map((group, position) => (
    <div key={group.grade} role="group" aria-label={GRADE_WORDS[group.grade]}>
      {position > 0 ? <MenuSeparator /> : null}
      <MenuLabel>{GRADE_WORDS[group.grade]}</MenuLabel>
      {group.signals.map((signal) => (
        <MenuRow
          key={signal.key}
          tall
          checked={Boolean(controls.signals?.[signal.key])}
          onClick={() => controls.toggleSignal(signal.key)}
        >
          <span className="block leading-5">{signal.label}</span>
          <span className="block text-[11px] leading-4 text-ink-3">{evidenceLine(signal)}</span>
        </MenuRow>
      ))}
    </div>
  ))
}
