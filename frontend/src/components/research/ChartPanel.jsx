import { Link } from 'react-router-dom'
import { CandlestickChart, Maximize2, Sigma } from 'lucide-react'

import { CHART_TYPES, DEFAULT_PANE_HEIGHTS, activeIndicatorCount } from '../../lib/chartOptions'
import { Card } from '../ui'
import { Menu } from './menu'
import { ChartTypeMenuItems, IndicatorMenuItems } from './chartMenus'
import ChartCanvas from './ChartCanvas'
import { LineSaveAlert, PeriodChange, RangeButtons } from './chartHeader'

const CHART_HEIGHT = 390

export default function ChartPanel({
  bars,
  ind,
  timeWindow,
  isLoading,
  error,
  controls,
  hover,
  setHover,
  symbol,
  unresolved,
  earningsMarkers = [],
  futureDates,
  lines,
  onMoveLine,
  onCreateLine,
  onDeleteLine,
  onEditLineLabel,
  lineSaveFailed = false,
  expandHref,
}) {
  const { type } = controls
  const activeCount = activeIndicatorCount(controls)

  return (
    <Card padding={false}>
      <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-line flex-wrap">
        <RangeButtons controls={controls} />

        <span className="w-px h-5 bg-line mx-1" />

        <Menu label={Object.fromEntries(CHART_TYPES)[type]} icon={CandlestickChart} width={160}>
          <ChartTypeMenuItems controls={controls} />
        </Menu>

        <Menu label={`Indicators${activeCount ? ` · ${activeCount}` : ''}`} icon={Sigma} width={230}>
          <IndicatorMenuItems controls={controls} />
        </Menu>

        <LineSaveAlert failed={lineSaveFailed} />

        <div className="ml-auto flex items-center gap-2">
          <PeriodChange bars={bars} />
          {expandHref ? (
            <Link
              to={expandHref}
              aria-label="Open advanced chart"
              title="Open advanced chart"
              className="w-7 h-7 rounded-[7px] flex items-center justify-center text-ink-3 hover:text-ink hover:bg-hover"
            >
              <Maximize2 size={13} />
            </Link>
          ) : null}
        </div>
      </div>

      <ChartCanvas
        bars={bars}
        ind={ind}
        timeWindow={timeWindow}
        controls={controls}
        hover={hover}
        setHover={setHover}
        symbol={symbol}
        isLoading={isLoading}
        error={error}
        unresolved={unresolved}
        earningsMarkers={earningsMarkers}
        futureDates={futureDates}
        lines={lines}
        onMoveLine={onMoveLine}
        onCreateLine={onCreateLine}
        onDeleteLine={onDeleteLine}
        onEditLineLabel={onEditLineLabel}
        priceHeight={CHART_HEIGHT}
        paneHeights={DEFAULT_PANE_HEIGHTS}
      />
    </Card>
  )
}
