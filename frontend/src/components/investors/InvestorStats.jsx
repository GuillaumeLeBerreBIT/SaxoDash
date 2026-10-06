import { StatStrip, StatRow, InfoTip } from '../ui'
import { fmtPct, fmtNum } from '../../lib/format'
import { fmtFiledDate } from '../../lib/investors'

export default function InvestorStats({
  top10_weight,
  top10_positions,
  total_positions,
  filing_date,
  turnover,
}) {
  return (
    <StatStrip>
      <StatRow
        label="Top 10"
        value={fmtPct(top10_weight, { sign: false, decimals: 1 })}
      />
      <StatRow
        label="Largest"
        value={fmtNum(top10_positions)}
      />
      <StatRow
        label="Total"
        value={fmtNum(total_positions)}
      />
      <StatRow
        label="Filed"
        value={fmtFiledDate(filing_date)}
      />
      <StatRow
        label={
          <span className="inline-flex items-center gap-1">
            Turnover
            <InfoTip label="Turnover">
              Value of positions opened this quarter plus value of positions closed (at last quarter's value), divided by both quarters' combined value.
            </InfoTip>
          </span>
        }
        value={fmtPct(turnover, { sign: false, decimals: 1 })}
      />
    </StatStrip>
  )
}
