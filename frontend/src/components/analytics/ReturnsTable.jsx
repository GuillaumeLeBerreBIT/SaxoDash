import { Card, Tag, Td, Th, Tr } from '../ui'
import { fmtPct, pctTone } from '../../lib/format'
import { needsDaysNote } from '../../lib/portfolioStats'

const TONE_TEXT = { positive: 'text-up', negative: 'text-down', neutral: 'text-ink-2' }
const ALPHA_TAG = { positive: 'up', negative: 'down', neutral: 'neutral' }

export default function ReturnsTable({ periods, benchmarkName, className = '' }) {
  return (
    <Card
      flush
      className={className}
      context="Saxo account value change · deposits and withdrawals are not separated"
      dot="ok"
      title={`Returns vs ${benchmarkName}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <Th edge>Period</Th>
              <Th align="right">Portfolio</Th>
              <Th align="right" hideBelow="md">{benchmarkName}</Th>
              <Th align="right" edge>Alpha</Th>
            </tr>
          </thead>
          <tbody>
            {periods.map((row) => (
              <Tr key={row.label}>
                <Td edge className="text-ink-2">{row.label}</Td>
                <Td align="right" className={`font-semibold ${row.portfolio_pct != null ? TONE_TEXT[pctTone(row.portfolio_pct, 1)] : 'text-ink-3'}`}>
                  {fmtPct(row.portfolio_pct, { decimals: 1 })}
                  {row.portfolio_pct == null && needsDaysNote(row.needs_days) && (
                    <div className="text-[12px] font-normal text-ink-3">{needsDaysNote(row.needs_days)}</div>
                  )}
                </Td>
                <Td align="right" hideBelow="md" className="text-ink-2">{fmtPct(row.benchmark_pct, { decimals: 1 })}</Td>
                <Td align="right" edge>
                  {row.alpha_pct != null ? (
                    <Tag tone={ALPHA_TAG[pctTone(row.alpha_pct, 1)]} className="num">
                      {fmtPct(row.alpha_pct, { decimals: 1 })}
                    </Tag>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
