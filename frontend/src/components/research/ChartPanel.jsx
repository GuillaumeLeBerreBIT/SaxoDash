import { CandlestickChart, Sigma } from 'lucide-react'

import { fmtNum, fmtPct } from '../../lib/format'
import { INTERVALS, barChange, periodChange } from '../../lib/research'
import { chartPlaceholderFor } from '../../lib/chartState'
import { Card, ChartPlaceholder } from '../ui'
import { Menu, MenuLabel, MenuRow, MenuSeparator, TBtn } from './menu'
import { MacdPane, RsiPane, TimeAxis, VolumePane } from './panes'
import { OVERLAY_STROKES } from '../../lib/chartGeometry'
import { SubPane, TVChart } from './TVChart'

const CHART_TYPES = [
  ['candles', 'Candles'],
  ['bars', 'Bars'],
  ['line', 'Line'],
  ['area', 'Area'],
]

const OVERLAY_DEFS = [
  { key: 'ma20', label: 'MA 20' },
  { key: 'ma50', label: 'MA 50' },
  { key: 'ema9', label: 'EMA 9' },
  { key: 'bb', label: 'Bollinger (20, 2)' },
  { key: 'vwap', label: 'VWAP' },
]

const PANE_DEFS = [
  { key: 'volume', label: 'Volume' },
  { key: 'rsi', label: 'RSI (14)' },
  { key: 'macd', label: 'MACD (12, 26, 9)' },
]

const CHART_HEIGHT = 368

function valueAt(series, hover) {
  if (!series?.length) return null
  return series[hover ?? series.length - 1]
}

function OhlcLegend({ bar, change, overlays, ind, hover }) {
  const up = bar.close >= bar.open

  return (
    <div className="flex items-center gap-3 px-3 pt-2 text-[11px] num font-mono flex-wrap">
      <span className="text-zinc-400">{bar.date}</span>
      {[
        ['O', bar.open],
        ['H', bar.high],
        ['L', bar.low],
        ['C', bar.close],
      ].map(([key, value]) => (
        <span key={key} className="text-zinc-500">
          {key} <span className={up ? 'text-emerald-400' : 'text-red-400'}>{fmtNum(value, 2)}</span>
        </span>
      ))}
      {change == null ? null : (
        <span className={change >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmtPct(change)}</span>
      )}
      <span className="text-zinc-500">
        Vol <span className="text-zinc-300">{fmtNum(bar.volume / 1e6, 1)}M</span>
      </span>
      {OVERLAY_DEFS.filter((o) => overlays[o.key] && o.key !== 'bb').map((o) => {
        const value = valueAt(ind[o.key], hover)
        return (
          <span key={o.key} style={{ color: OVERLAY_STROKES[o.key] }} className="text-[10.5px]">
            {o.label} {value == null ? '—' : fmtNum(value, 2)}
          </span>
        )
      })}
    </div>
  )
}

export default function ChartPanel({ bars, ind, isLoading, error, controls, hover, setHover }) {
  const { range, type, overlays, panes, setRange, setType, toggleOverlay, togglePane } = controls
  const activeCount = Object.values({ ...overlays, ...panes }).filter(Boolean).length
  const period = periodChange(bars)
  const bar = bars[hover ?? bars.length - 1]

  const notConnected = error?.status === 409
  const placeholder = notConnected ? (
    <ChartPlaceholder height={CHART_HEIGHT}>
      Saxo is not connected, so there is no price history to chart yet.
    </ChartPlaceholder>
  ) : (
    chartPlaceholderFor({ isLoading, error, data: bars, minPoints: 2, height: CHART_HEIGHT })
  )

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
          {CHART_TYPES.map(([key, label]) => (
            <MenuRow key={key} checked={type === key} onClick={() => setType(key)}>
              {label}
            </MenuRow>
          ))}
        </Menu>

        <Menu label={`Indicators${activeCount ? ` · ${activeCount}` : ''}`} icon={Sigma} width={230}>
          <MenuLabel>Overlays</MenuLabel>
          {OVERLAY_DEFS.map((overlay) => (
            <MenuRow
              key={overlay.key}
              checked={overlays[overlay.key]}
              dot={OVERLAY_STROKES[overlay.key]}
              onClick={() => toggleOverlay(overlay.key)}
            >
              {overlay.label}
            </MenuRow>
          ))}
          <MenuSeparator />
          <MenuLabel>Lower panes</MenuLabel>
          {PANE_DEFS.map((pane) => (
            <MenuRow
              key={pane.key}
              checked={panes[pane.key]}
              onClick={() => togglePane(pane.key)}
            >
              {pane.label}
            </MenuRow>
          ))}
        </Menu>

        {period == null ? null : (
          <span className="ml-auto text-[11px] text-zinc-500">
            Period{' '}
            <span className={`num font-mono ${period >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtPct(period)}
            </span>
          </span>
        )}
      </div>

      {placeholder ?? (
        <>
          {bar ? (
            <OhlcLegend
              bar={bar}
              change={barChange(bars, hover)}
              overlays={overlays}
              ind={ind}
              hover={hover}
            />
          ) : null}

          <div className="px-1 pb-1">
            <TVChart
              data={bars}
              ind={ind}
              type={type}
              overlays={overlays}
              hover={hover}
              setHover={setHover}
              height={CHART_HEIGHT}
            />
            {panes.volume ? (
              <SubPane title="Volume" height={74}>
                <VolumePane data={bars} hover={hover} setHover={setHover} />
              </SubPane>
            ) : null}
            {panes.rsi ? (
              <SubPane title={`RSI 14 ${fmtNum(valueAt(ind.rsi, hover) ?? 0, 1)}`} height={92}>
                <RsiPane values={ind.rsi} hover={hover} setHover={setHover} />
              </SubPane>
            ) : null}
            {panes.macd ? (
              <SubPane title="MACD 12 26 9" height={92}>
                <MacdPane macd={ind.macd} hover={hover} setHover={setHover} />
              </SubPane>
            ) : null}
            <TimeAxis data={bars} />
          </div>
        </>
      )}
    </Card>
  )
}
