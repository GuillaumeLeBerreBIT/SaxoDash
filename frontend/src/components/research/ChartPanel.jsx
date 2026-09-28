import { Link } from 'react-router-dom'
import { CandlestickChart, Maximize2, Sigma } from 'lucide-react'

import { fmtPct } from '../../lib/format'
import { INTERVALS, periodChange } from '../../lib/research'
import { CHART_TYPES, DEFAULT_PANE_HEIGHTS, activeIndicatorCount } from '../../lib/chartOptions'
import { Card, TBtn } from '../ui'
import { Menu } from './menu'
import { ChartTypeMenuItems, IndicatorMenuItems } from './chartMenus'
import ChartCanvas from './ChartCanvas'

const CHART_HEIGHT = 390

export default function ChartPanel({
  bars,
  ind,
  isLoading,
  error,
  controls,
  hover,
  setHover,
  symbol,
  unresolved,
  earningsMarkers = [],
  lines,
  onMoveLine,
  onCreateLine,
  onDeleteLine,
  lineSaveFailed = false,
  expandHref,
}) {
  const { range, type, setRange } = controls
  const activeCount = activeIndicatorCount(controls)
  const period = periodChange(bars)

  return (
    <Card padding={false}>
      <div className="flex items-center gap-1 px-2.5 py-2 border-b border-white/[0.06] flex-wrap">
        <div className="flex items-center gap-0.5">
          {INTERVALS.map((interval) => (
            <TBtn key={interval} active={range === interval} onClick={() => setRange(interval)}>
              {interval}
            </TBtn>
          ))}
        </div>

        <span className="w-px h-5 bg-white/[0.08] mx-1.5" />

        <Menu label={Object.fromEntries(CHART_TYPES)[type]} icon={CandlestickChart} width={160}>
          <ChartTypeMenuItems controls={controls} />
        </Menu>

        <Menu label={`Indicators${activeCount ? ` · ${activeCount}` : ''}`} icon={Sigma} width={230}>
          <IndicatorMenuItems controls={controls} />
        </Menu>

        {lineSaveFailed ? (
          <span role="alert" className="ml-2 text-[var(--fig-2xs)] text-red-400">
            Couldn't save line
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {period == null ? null : (
            <span className="text-[var(--fig-2xs)] text-zinc-500">
              Period{' '}
              <span className={`num font-mono ${period >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPct(period)}
              </span>
            </span>
          )}
          {expandHref ? (
            <Link
              to={expandHref}
              aria-label="Open advanced chart"
              title="Open advanced chart"
              className="w-7 h-7 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05]"
            >
              <Maximize2 size={13} />
            </Link>
          ) : null}
        </div>
      </div>

      <ChartCanvas
        bars={bars}
        ind={ind}
        controls={controls}
        hover={hover}
        setHover={setHover}
        symbol={symbol}
        isLoading={isLoading}
        error={error}
        unresolved={unresolved}
        earningsMarkers={earningsMarkers}
        lines={lines}
        onMoveLine={onMoveLine}
        onCreateLine={onCreateLine}
        onDeleteLine={onDeleteLine}
        priceHeight={CHART_HEIGHT}
        paneHeights={DEFAULT_PANE_HEIGHTS}
      />
    </Card>
  )
}
