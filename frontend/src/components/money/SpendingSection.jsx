import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSpendingSummary } from '../../api/queries'
import { fmtEur, fmtNum } from '../../lib/format'
import { topCategory } from '../../lib/spending'
import { CATEGORY_LABELS } from '../../lib/categories'
import { periodKeyFromParam, periodParam, resolvePeriod } from '../../lib/periods'
import { Card, InfoTip, Tile } from '../ui'
import PeriodSelector from '../PeriodSelector'
import SpendingCategoryChart from '../SpendingCategoryChart'
import SpendingTrendChart from '../SpendingTrendChart'
import ReviewQueue from '../ReviewQueue'
import { BOARD, SPAN_6, SPAN_12, TILES } from './layout'
import { SpendingDelta } from './MoneyPanels'

function initialPeriod(param) {
  const key = periodKeyFromParam(param)
  return { key, ...resolvePeriod(key) }
}

export default function SpendingSection() {
  const [params, setParams] = useSearchParams()
  const [period, setPeriod] = useState(() => initialPeriod(params.get('period')))
  const { data: summary, isLoading, error, refetch } = useSpendingSummary(
    `?date_from=${period.date_from}&date_to=${period.date_to}`,
  )

  const choosePeriod = (next) => {
    setPeriod(next)
    if (next.key === 'custom') return
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        const short = periodParam(next.key)
        if (short) updated.set('period', short)
        else updated.delete('period')
        return updated
      },
      { replace: true },
    )
  }

  const top = topCategory(summary?.categories)
  const absent = (value) => (summary ? value : null)

  return (
    <>
      <h1 className="sr-only">Spending</h1>
      <div className={BOARD}>
        <Card
          className={SPAN_12}
          context={`Categorised bank transactions · ${period.label}`}
          dot={error ? 'warn' : summary ? 'ok' : 'off'}
          right={
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Link to="/money?section=budgets" className="text-[13px] font-semibold text-ink-2 hover:text-ink whitespace-nowrap">
                Budgets →
              </Link>
              <PeriodSelector value={period} onChange={choosePeriod} />
            </div>
          }
        >
          <div className={TILES}>
            <Tile
              label={`Total spending — ${period.label}`}
              value={absent(fmtEur(summary?.total))}
              sub={<SpendingDelta summary={summary} />}
            />
            <Tile label="Transactions" value={absent(fmtNum(summary?.transaction_count))} />
            <Tile
              label="Top category"
              value={top ? (CATEGORY_LABELS[top.category] ?? top.category) : null}
              sub={top ? fmtEur(top.amount) : undefined}
            />
            <Tile
              label={
                <span className="inline-flex items-center gap-1.5">
                  Transfers
                  <InfoTip label="About transfers">
                    Money moved between your own accounts. It is left out of the totals above.
                  </InfoTip>
                </span>
              }
              value={absent(fmtEur(summary?.transfers))}
              sub="Moved between your own accounts"
            />
          </div>
        </Card>

        <SpendingCategoryChart
          className={SPAN_6}
          categories={summary?.categories}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          periodLabel={period.label}
          period={period}
        />
        <SpendingTrendChart className={SPAN_6} />
        <ReviewQueue className={SPAN_12} />
      </div>
    </>
  )
}
