import { InfoTip, StatRow, StatStrip } from '../ui'
import { UNKNOWN, fmtNum, fmtPct } from '../../lib/format'
import { fmtFiledDate, fmtUsdCompact, quarterLabel } from '../../lib/investors'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

export default function InvestorStats({ detail }) {
  const moved = detail.new_count == null ? UNKNOWN : `+${detail.new_count} · −${detail.exited_count}`
  return (
    <StatStrip>
      <StatRow label="Total value" value={fmtUsdCompact(detail.total_value)} note={`as of ${quarterLabel(detail.quarter)} end`} />
      <StatRow label="Positions" value={fmtNum(detail.positions)} note="US-listed longs + options" />
      <StatRow label="Top 10 share" value={share(detail.top10_weight)} note="of reported value" />
      <StatRow label="vs previous quarter" value={moved} note="new · sold out" />
      <StatRow
        label={
          <span className="inline-flex items-center gap-1">
            Turnover
            <InfoTip label="What turnover means">
              Value of positions opened this quarter plus value of positions closed, as a share of both quarters
              combined. Size changes inside kept positions are not counted.
            </InfoTip>
          </span>
        }
        value={share(detail.turnover)}
        note={`filed ${fmtFiledDate(detail.filed_on)}`}
      />
    </StatStrip>
  )
}
