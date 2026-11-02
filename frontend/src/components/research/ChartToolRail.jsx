import { Link } from 'react-router-dom'
import { CandlestickChart, Check, Crosshair, LayoutGrid, Link2, Minimize2, Minus, RotateCcw, Sigma, Slash, Type } from 'lucide-react'

import { Menu, MenuRow } from './menu'
import { ChartTypeMenuItems, IndicatorMenuItems } from './chartMenus'
import { CHART_LAYOUTS, gridStyle, paneStyle } from '../../lib/chartLayouts'

const RAIL_BUTTON = 'w-9 h-9 rounded-lg flex items-center justify-center transition-colors'

function RailDivider({ className = '' }) {
  return <span role="separator" className={`w-px h-6 mx-1 lg:w-6 lg:h-px lg:mx-0 lg:my-1 bg-line ${className}`} />
}

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
        pressed ? 'bg-selected text-ink' : 'text-ink-3 hover:text-ink hover:bg-hover'
      }`}
    >
      <Icon size={16} />
    </button>
  )
}

function LayoutIcon({ preset }) {
  return (
    <span
      aria-hidden="true"
      className="w-5 h-3.5 inline-grid align-middle mr-1.5 gap-px p-px rounded-sm border border-ink-3 shrink-0"
      style={gridStyle(preset)}
    >
      {Array.from({ length: preset.panes }, (_, index) => (
        <span key={index} className="bg-ink-3 rounded-[1px]" style={paneStyle(preset, index)} />
      ))}
    </span>
  )
}

export default function ChartToolRail({
  controls,
  tool,
  onToolChange,
  canAnnotate,
  backHref,
  layout = '1',
  onLayoutChange,
  linkable = false,
  linked = false,
  onLinkedChange,
}) {
  return (
    <nav aria-label="Chart tools" className="sd-panel bg-pane rounded-xl flex flex-row flex-wrap lg:flex-col items-center gap-1 px-1.5 py-1.5 lg:px-0 lg:py-2">
      <RailButton label="Crosshair" icon={Crosshair} pressed={tool === 'crosshair'} onClick={() => onToolChange('crosshair')} />
      <RailButton
        label="Horizontal line"
        icon={Minus}
        pressed={tool === 'hline'}
        disabled={!canAnnotate}
        onClick={() => onToolChange(tool === 'hline' ? 'crosshair' : 'hline')}
      />
      <RailButton
        label="Ray"
        icon={Slash}
        pressed={tool === 'ray'}
        disabled={!canAnnotate}
        onClick={() => onToolChange(tool === 'ray' ? 'crosshair' : 'ray')}
      />
      <RailButton
        label="Text"
        icon={Type}
        pressed={tool === 'text'}
        disabled={!canAnnotate}
        onClick={() => onToolChange(tool === 'text' ? 'crosshair' : 'text')}
      />

      <RailDivider />

      <Menu side="right" label="Chart type" icon={CandlestickChart} width={160}>
        <ChartTypeMenuItems controls={controls} />
      </Menu>
      <Menu side="right" label="Indicators" icon={Sigma} width={230}>
        <IndicatorMenuItems controls={controls} />
      </Menu>
      <div className="hidden lg:flex">
        <Menu side="right" label="Layout" icon={LayoutGrid} width={210}>
          {CHART_LAYOUTS.map((preset) => (
            <MenuRow
              key={preset.id}
              onClick={() => onLayoutChange(preset.id)}
              right={preset.id === layout ? <Check size={12} className="text-ink" /> : null}
            >
              <LayoutIcon preset={preset} />
              {preset.label}
            </MenuRow>
          ))}
        </Menu>
      </div>
      {linkable ? (
        <div className="hidden lg:flex">
          <RailButton label="Link panes" icon={Link2} pressed={linked} onClick={() => onLinkedChange(!linked)} />
        </div>
      ) : null}
      <RailButton
        label="Reset price scale"
        icon={RotateCcw}
        disabled={controls.yScale === 1}
        onClick={() => controls.setYScale(1)}
      />

      <RailDivider className="ml-auto lg:ml-0 lg:mt-auto" />

      <Link
        to={backHref}
        aria-label="Back to Research"
        title="Back to Research"
        className={`${RAIL_BUTTON} text-ink-3 hover:text-ink hover:bg-hover`}
      >
        <Minimize2 size={16} />
      </Link>
    </nav>
  )
}
