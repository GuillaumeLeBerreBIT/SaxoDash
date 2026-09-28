import { Link } from 'react-router-dom'
import { CandlestickChart, Crosshair, Minimize2, Minus, RotateCcw, Sigma } from 'lucide-react'

import { Menu } from './menu'
import { ChartTypeMenuItems, IndicatorMenuItems } from './chartMenus'

const RAIL_BUTTON = 'w-9 h-9 rounded flex items-center justify-center transition-colors'

function RailButton({ label, icon: Icon, pressed, disabled = false, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`${RAIL_BUTTON} disabled:opacity-35 disabled:pointer-events-none ${
        pressed ? 'bg-blue-500/15 text-blue-300' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]'
      }`}
    >
      <Icon size={16} />
    </button>
  )
}

export default function ChartToolRail({ controls, placingLine, onPlacingLineChange, canPlaceLine, backHref }) {
  return (
    <nav aria-label="Chart tools" className="flex flex-col items-center gap-1 py-2 border-r border-white/[0.06]">
      <RailButton label="Crosshair" icon={Crosshair} pressed={!placingLine} onClick={() => onPlacingLineChange(false)} />
      <RailButton
        label="Horizontal line"
        icon={Minus}
        pressed={placingLine}
        disabled={!canPlaceLine}
        onClick={() => onPlacingLineChange(!placingLine)}
      />

      <span className="w-6 h-px bg-white/[0.08] my-1" />

      <Menu side="right" label="Chart type" icon={CandlestickChart} width={160}>
        <ChartTypeMenuItems controls={controls} />
      </Menu>
      <Menu side="right" label="Indicators" icon={Sigma} width={230}>
        <IndicatorMenuItems controls={controls} />
      </Menu>
      <RailButton
        label="Reset price scale"
        icon={RotateCcw}
        disabled={controls.yScale === 1}
        onClick={() => controls.setYScale(1)}
      />

      <Link
        to={backHref}
        aria-label="Back to Research"
        title="Back to Research"
        className={`${RAIL_BUTTON} mt-auto text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]`}
      >
        <Minimize2 size={16} />
      </Link>
    </nav>
  )
}
