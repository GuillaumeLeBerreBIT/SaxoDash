import { Link } from 'react-router-dom'
import { PenLine } from 'lucide-react'

import { fmtEur, fmtMoney, fmtQty } from '../../lib/format'
import { colorForTicker } from '../../lib/charts'
import { ownershipTicker } from '../../lib/ownership'
import { WEIGHT_CAP_PCT } from '../../lib/portfolioStats'
import { moveLabel, priceBasis, weakestPriceBasis } from '../../lib/pricing'
import { researchHref } from '../../lib/research'
import { positionVerdict } from '../../lib/verdicts'
import { useChartColors } from '../../theme/useChartColors'
import { Card, DayChange, InstrumentLogo, Move, SortableTh, Tag, Td, Th, Tr } from '../ui'
import PriceBasisNote from '../PriceBasisNote'
import { FundChange, FundShares } from '../investors/FundHoldings'
import CongressActivity from '../congress/CongressActivity'
import ActionBadge from '../verdicts/ActionBadge'

const WEIGHT_SCALE_PCT = 30
const STICKY = 'sticky top-0 z-10 bg-pane'

const SORT_NAMES = {
  name: 'instrument',
  qty: 'quantity',
  value: 'value',
  pnl_pct: 'return',
  pnl: 'P/L',
  weight: 'weight',
}

function WeightBar({ weight }) {
  const known = weight != null
  const pct = Number(weight)
  const over = known && pct > WEIGHT_CAP_PCT
  return (
    <div className="flex items-center justify-end gap-2.5">
      <div className="relative w-[90px] h-1.5 rounded-full bg-track">
        {known && (
          <i
            className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-warn' : 'bg-ink'}`}
            style={{ width: `${Math.min(100, (pct / WEIGHT_SCALE_PCT) * 100)}%` }}
          />
        )}
        <b
          title={`Your ${WEIGHT_CAP_PCT}% cap`}
          className="absolute -top-[3px] w-px h-3 bg-ink-2"
          style={{ left: `${(WEIGHT_CAP_PCT / WEIGHT_SCALE_PCT) * 100}%` }}
        />
      </div>
      <span className={`num w-[42px] text-right ${over ? 'text-warn' : 'text-ink-2'}`}>
        {known ? `${pct.toFixed(1)}%` : '—'}
      </span>
    </div>
  )
}

function InstrumentCell({ position }) {
  const c = useChartColors()
  return (
    <Link to={researchHref(position.ticker)} className="flex items-center gap-2.5 group min-w-0">
      <InstrumentLogo
        symbol={position.ticker}
        fallback={<span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorForTicker(position.ticker, c) }} />}
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-ink group-hover:underline truncate max-w-[200px]" title={position.name}>
            {position.name}
          </span>
          {position.type === 'ETF' && <Tag tone="warn">ETF</Tag>}
          {position.has_thesis === false && (
            <PenLine
              size={12}
              className="text-ink-3 shrink-0"
              title="No thesis written yet — add one on the Research page"
            />
          )}
        </span>
        <span className="flex items-center gap-1 text-[12px] text-ink-3">
          <span>{position.ticker}</span>
          {position.sector && <span className="truncate max-w-[160px]">· {position.sector}</span>}
          {position.price_source !== 'live' && (
            <span title={priceBasis(position.price_source).note} className="md:hidden shrink-0 text-warn">
              est.
            </span>
          )}
        </span>
      </span>
    </Link>
  )
}

export default function PositionsTable({ positions, sortedPositions, summary, quotes, ownership, congress, verdicts, sort, onSort, className = '' }) {
  const fundStock = (position) => ownership?.stocks?.[ownershipTicker(position)]
  const dayLabel = moveLabel(quotes.values())
  const basis = weakestPriceBasis(positions)
  const sortedBy = sort ? ` · sorted by ${SORT_NAMES[sort.key]}` : ''
  const header = (props) => ({ sort, onSort, className: STICKY, ...props })

  return (
    <Card
      flush
      className={className}
      context={`Saxo · ${positions.length} position${positions.length === 1 ? '' : 's'}${sortedBy}`}
      dot={!positions.length ? 'off' : basis && basis.label !== 'Live' ? 'warn' : 'ok'}
      title="Positions"
      right={<PriceBasisNote positions={positions} />}
    >
      <div className="max-h-[720px] overflow-auto">
        <table aria-label="Positions" className="w-full">
          <thead>
            <tr>
              <SortableTh edge {...header({ sortKey: 'name' })}>Instrument</SortableTh>
              <SortableTh align="right" hideBelow="md" {...header({ sortKey: 'qty' })}>Qty</SortableTh>
              <Th align="right" hideBelow="md" className={STICKY}>Avg cost</Th>
              <Th align="right" hideBelow="md" className={STICKY}>Last</Th>
              <Th align="right" hideBelow="md" className={STICKY}>{dayLabel}</Th>
              <SortableTh align="right" {...header({ sortKey: 'value' })}>Value</SortableTh>
              <SortableTh align="right" hideBelow="md" {...header({ sortKey: 'pnl_pct' })}>Return</SortableTh>
              <SortableTh align="right" {...header({ sortKey: 'pnl' })}>P/L</SortableTh>
              <SortableTh align="right" hideBelow="md" {...header({ sortKey: 'weight' })}>Weight</SortableTh>
              <Th align="right" hideBelow="md" className={STICKY}>Verdict</Th>
              <Th align="right" hideBelow="wide" className={STICKY}>Fund shares</Th>
              <Th align="right" hideBelow="wide" className={STICKY}>Fund change</Th>
              <Th edge align="right" hideBelow="wide" className={STICKY}>Congress</Th>
            </tr>
          </thead>
          <tbody>
            {sortedPositions.map((p) => (
              <Tr key={p.ticker}>
                <Td edge className="w-full max-w-0 md:w-auto md:max-w-none">
                  <InstrumentCell position={p} />
                </Td>
                <Td align="right" hideBelow="md" className="text-ink-2">{fmtQty(p.qty)}</Td>
                <Td align="right" hideBelow="md" className="text-ink-2">{fmtMoney(p.avg_cost, p.currency)}</Td>
                <Td align="right" hideBelow="md" className="text-ink">
                  <span
                    title={priceBasis(p.price_source).note}
                    className={p.price_source === 'live' ? '' : 'decoration-dotted underline underline-offset-4 decoration-ink-3'}
                  >
                    {fmtMoney(p.current_price, p.currency)}
                  </span>
                </Td>
                <Td align="right" hideBelow="md"><DayChange value={quotes.get(p.uic)?.change_pct} /></Td>
                <Td align="right" className="font-semibold text-ink">{fmtEur(p.value)}</Td>
                <Td align="right" hideBelow="md"><Move value={p.pnl_pct} digits={1} /></Td>
                <Td align="right" className={p.pnl == null ? 'text-ink-3' : Number(p.pnl) >= 0 ? 'text-up' : 'text-down'}>
                  {fmtEur(p.pnl, { sign: true })}
                </Td>
                <Td align="right" hideBelow="md"><WeightBar weight={p.weight} /></Td>
                <Td align="right" hideBelow="md" className="max-w-[120px]">
                  <ActionBadge verdict={positionVerdict(p, verdicts)} />
                </Td>
                <Td align="right" hideBelow="wide">
                  <FundShares ticker={p.ticker} stock={fundStock(p)} quarter={ownership?.quarter} />
                </Td>
                <Td align="right" hideBelow="wide">
                  <FundChange ticker={p.ticker} stock={fundStock(p)} quarter={ownership?.quarter} />
                </Td>
                <Td edge align="right" hideBelow="wide">
                  <CongressActivity ticker={p.ticker} stock={congress?.stocks?.[ownershipTicker(p)]} windowDays={congress?.window_days} />
                </Td>
              </Tr>
            ))}
            <tr className="border-t border-line bg-tile">
              <Td edge className="!whitespace-normal md:!whitespace-nowrap font-semibold text-ink">
                Total ({positions.length} {positions.length === 1 ? 'holding' : 'holdings'})
              </Td>
              <Td hideBelow="md" />
              <Td hideBelow="md" />
              <Td hideBelow="md" />
              <Td hideBelow="md" />
              <Td align="right" className="font-semibold text-ink">{fmtEur(summary.total_value)}</Td>
              <Td hideBelow="md" />
              <Td
                align="right"
                className={`font-semibold ${summary.total_pnl == null ? 'text-ink-3' : Number(summary.total_pnl) >= 0 ? 'text-up' : 'text-down'}`}
              >
                {fmtEur(summary.total_pnl, { sign: true })}
              </Td>
              <Td align="right" hideBelow="md" className="text-ink-2">100.0%</Td>
              <Td hideBelow="md" />
              <Td hideBelow="wide" />
              <Td hideBelow="wide" />
              <Td edge hideBelow="wide" />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 px-[18px] text-[12px] text-ink-3">
        The tick on each weight bar is your {WEIGHT_CAP_PCT}% cap.
      </p>
    </Card>
  )
}
