import { Chip } from '../ui'

const QUICK_OVERLAYS = [
  ['ma20', 'MA 20'],
  ['ma50', 'MA 50'],
]

export default function IndicatorChips({ controls }) {
  return (
    <div role="group" aria-label="Quick indicators" className="flex items-center gap-1.5">
      {QUICK_OVERLAYS.map(([key, label]) => (
        <Chip key={key} active={controls.overlays?.[key]} onClick={() => controls.toggleOverlay(key)}>
          {label}
        </Chip>
      ))}
      <Chip active={controls.panes?.rsi} onClick={() => controls.togglePane('rsi')}>
        RSI
      </Chip>
    </div>
  )
}
