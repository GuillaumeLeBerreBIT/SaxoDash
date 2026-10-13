import { useState } from 'react'

import { useStatements } from '../../api/queries'
import { STATEMENTS, latestPeriods, rowsWithData, statementByKey, waterfallSteps } from '../../lib/statements'
import { Card, CardHeader, Skeleton, TBtn } from '../ui'
import CashFlowTrendChart from './CashFlowTrendChart'
import FinancialsChart from './FinancialsChart'
import ProfitWaterfall from './ProfitWaterfall'
import QuarterlyTrendsChart from './QuarterlyTrendsChart'
import StatementTable from './StatementTable'

const VISIBLE = { annual: 6, quarterly: 8 }
const FREQUENCIES = [
  ['annual', 'Annual'],
  ['quarterly', 'Quarterly'],
]

function Statements({ symbol, statements }) {
  const [frequency, setFrequency] = useState('annual')
  const [statementKey, setStatementKey] = useState('income')

  if (statements.isLoading) {
    return (
      <Card>
        <CardHeader title="Financials" subtitle="From SEC filings, via Finnhub" />
        <Skeleton className="mt-4 h-40 w-full" data-testid="financials-loading" />
      </Card>
    )
  }

  if (statements.error) {
    return (
      <Card>
        <CardHeader title="Financials" subtitle="From SEC filings, via Finnhub" />
        <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">Statements could not be loaded.</p>
        <div className="mt-3">
          <TBtn onClick={() => statements.refetch()}>Try again</TBtn>
        </div>
      </Card>
    )
  }

  const data = statements.data
  if (!data?.available || data.annual.length === 0) {
    return (
      <Card>
        <CardHeader title="Financials" subtitle="From SEC filings, via Finnhub" />
        <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">
          {data?.reason || `Statements are unavailable for ${symbol}.`}
        </p>
      </Card>
    )
  }

  const hasQuarters = data.quarterly.length > 0
  const active = hasQuarters ? frequency : 'annual'
  const allPeriods = data[active]
  const periods = latestPeriods(allPeriods, VISIBLE[active])
  const statement = statementByKey(statementKey)
  const latest = periods.at(-1)

  return (
    <>
      <Card>
        <CardHeader
          title="Revenue and profit"
          subtitle="From SEC filings, via Finnhub"
          right={
            hasQuarters ? (
              <div className="flex items-center gap-0.5">
                {FREQUENCIES.map(([key, label]) => (
                  <TBtn key={key} active={active === key} onClick={() => setFrequency(key)}>
                    {label}
                  </TBtn>
                ))}
              </div>
            ) : null
          }
        />
        {data.partial && (
          <p className="mt-2 text-[var(--fig-xs)] text-zinc-500">
            Quarterly figures could not be loaded; showing annual reports only.
          </p>
        )}
        <div className="mt-4">
          <FinancialsChart periods={periods} />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-0.5">
          {STATEMENTS.map(({ key, label }) => (
            <TBtn key={key} active={statement.key === key} onClick={() => setStatementKey(key)}>
              {label}
            </TBtn>
          ))}
        </div>
        <div className="mt-3">
          {rowsWithData(statement, periods).length > 0 ? (
            <StatementTable statement={statement} periods={periods} allPeriods={allPeriods} />
          ) : (
            <p className="text-[var(--fig-xs)] text-zinc-500">
              No {statement.label.toLowerCase()} figures for these periods.
            </p>
          )}
        </div>
      </Card>

      {waterfallSteps(latest).length > 0 && (
        <section>
          <Card>
            <CardHeader title="From revenue to profit" subtitle={latest.label} />
            <div className="mt-4">
              <ProfitWaterfall period={latest} />
            </div>
          </Card>
        </section>
      )}
    </>
  )
}

export default function FinancialsTab({ symbol, fundamentals }) {
  const statements = useStatements(symbol)
  const company = fundamentals.data?.available ? fundamentals.data : null

  return (
    <div className="space-y-4">
      <Statements key={symbol} symbol={symbol} statements={statements} />
      <CashFlowTrendChart trend={company?.cash_flow_trend} />
      <QuarterlyTrendsChart trends={company?.quarterly_trends} />
    </div>
  )
}
