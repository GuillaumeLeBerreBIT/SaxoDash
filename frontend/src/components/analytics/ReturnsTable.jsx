import { Card, Tag, Td, Th, Tr } from '../ui'
import { fmtPct, pctTone } from '../../lib/format'
import { comparablePeriods } from '../../lib/performanceAnswer'

const TONE_TEXT = { positive: 'text-up', negative: 'text-down', neutral: 'text-ink-2' }
const ALPHA_TAG = { positive: 'up', negative: 'down', neutral: 'neutral' }

export default function ReturnsTable({ periods, benchmarkName, className = '' }) {
  const { shown, waiting } = comparablePeriods(periods)
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
              <Th align="right" edge>Ahead / behind</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <Tr key={row.label}>
                <Td edge className="text-ink-2">{row.label}</Td>
                <Td align="right" className={`font-semibold ${TONE_TEXT[pctTone(row.portfolio_pct, 1)]}`}>
                  {fmtPct(row.portfolio_pct, { decimals: 1 })}
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
      {shown.length === 0 && <p className="px-[18px] text-[13px] text-ink-3">No period has enough history yet.</p>}
      {waiting > 0 && shown.length > 0 && (
        <p className="mt-2 px-[18px] text-[12px] text-ink-3">
          {waiting} longer {waiting === 1 ? 'period appears' : 'periods appear'} once there is enough history.
        </p>
      )}
    </Card>
  )
}
