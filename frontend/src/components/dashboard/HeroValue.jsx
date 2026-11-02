import { fmtEur } from '../../lib/format'
import { Move } from '../ui'

const PERIODS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['ytd', 'YTD'],
]

function Figure({ label, children }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[12px] text-ink-3">{label}</span>
      <span className="text-[13.5px] font-semibold num whitespace-nowrap">{children}</span>
    </div>
  )
}

function Delta({ label, delta }) {
  const known = delta && delta.pct != null
  return (
    <Figure label={label}>
      <Move value={known ? delta.pct : null} />
      {known && (
        <span className="block text-[12px] font-medium text-ink-3">{fmtEur(delta.abs, { sign: true, decimals: 0 })}</span>
      )}
    </Figure>
  )
}

function unrealisedTone(value) {
  if (value == null) return 'text-ink-3'
  const n = Number(value)
  if (n > 0) return 'text-up'
  if (n < 0) return 'text-down'
  return 'text-ink'
}

export default function HeroValue({ value, change, spendingThisMonth, unrealised }) {
  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-[26px] gap-y-3">
        <div className="text-[34px] font-bold tracking-[-0.02em] leading-none num text-ink">{fmtEur(value.net_worth)}</div>
        <div className="flex flex-wrap gap-x-[22px] gap-y-2">
          <Figure label="Positions">
            <span className="text-ink">{fmtEur(value.portfolio)}</span>
          </Figure>
          <Figure label="Saxo cash">
            <span className="text-ink">{fmtEur(value.broker_cash)}</span>
          </Figure>
          <Figure label="Bank">
            <span className="text-ink">{fmtEur(value.bank_only)}</span>
          </Figure>
          <Figure label="Unrealised">
            <span className={unrealisedTone(unrealised)}>{fmtEur(unrealised, { sign: true })}</span>
          </Figure>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-line">
        <div className="text-[12px] font-medium text-ink-3">Net worth change</div>
        <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-3">
          {PERIODS.map(([key, label]) => (
            <Delta key={key} label={label} delta={change?.[key]} />
          ))}
          {spendingThisMonth != null && (
            <Figure label="Spent MTD">
              <span className="text-ink">{fmtEur(spendingThisMonth)}</span>
            </Figure>
          )}
        </div>
      </div>
    </div>
  )
}
