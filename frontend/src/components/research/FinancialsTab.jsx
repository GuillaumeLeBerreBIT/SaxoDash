import { useState } from 'react'

import { useStatements } from '../../api/queries'
import { STATEMENTS, latestPeriods, rowsWithData, statementByKey, waterfallSteps } from '../../lib/statements'
import { Button, Card, Segmented, Skeleton } from '../ui'
import AssetsLiabilitiesChart from './AssetsLiabilitiesChart'
import CashAndDebtChart from './CashAndDebtChart'
import FinancialsChart from './FinancialsChart'
import ProfitWaterfall from './ProfitWaterfall'
import QuarterlyTrendsChart from './QuarterlyTrendsChart'
import StatementTable from './StatementTable'

const VISIBLE = { annual: 6, quarterly: 8 }
const FREQUENCIES = [
  { value: 'annual', label: 'Annual' },
  { value: 'quarterly', label: 'Quarterly' },
]
const STATEMENT_OPTIONS = STATEMENTS.map(({ key, label }) => ({ value: key, label }))
const SOURCE = 'SEC filings via Finnhub'

const HALVES =
  'grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start min-[1100px]:[&>*]:col-span-6 min-[1100px]:[&>:last-child:nth-child(odd)]:col-span-12'

function Halves({ children }) {
  return <div className={HALVES}>{children}</div>
}

function Notice({ children, action }) {
  return (
    <Card context={SOURCE} dot="off" title="Financials">
      {children}
      {action}
    </Card>
  )
}

function Statements({ symbol, statements, margins }) {
  const [frequency, setFrequency] = useState('annual')
  const [statementKey, setStatementKey] = useState('income')

  if (statements.isLoading) {
    return (
      <Halves>
        <Notice>
          <Skeleton className="h-40 w-full" data-testid="financials-loading" />
        </Notice>
        {margins}
      </Halves>
    )
  }

  if (statements.error && !statements.data) {
    return (
      <Halves>
        <Notice
          action={
            <div className="mt-3">
              <Button size="sm" onClick={() => statements.refetch()}>
                Try again
              </Button>
            </div>
          }
        >
          <p className="text-[13px] text-ink-3">Statements could not be loaded.</p>
        </Notice>
        {margins}
      </Halves>
    )
  }

  const data = statements.data
  if (!data?.available || data.annual.length === 0) {
    return (
      <Halves>
        <Notice>
          <p className="text-[13px] text-ink-3">{data?.reason || `Statements are unavailable for ${symbol}.`}</p>
        </Notice>
        {margins}
      </Halves>
    )
  }

  const hasQuarters = data.quarterly.length > 0
  const active = hasQuarters ? frequency : 'annual'
  const allPeriods = data[active]
  const periods = latestPeriods(allPeriods, VISIBLE[active])
  const statement = statementByKey(statementKey)
  const latest = periods.at(-1)
  const hasRows = rowsWithData(statement, periods).length > 0

  return (
    <>
      <Halves>
        <Card
          context={`${active === 'annual' ? 'Annual' : 'Quarterly'} · ${SOURCE}`}
          dot="ok"
          title="Revenue and profit"
          right={
            hasQuarters ? (
              <Segmented label="Period" options={FREQUENCIES} value={active} onChange={setFrequency} />
            ) : null
          }
        >
          {data.partial && (
            <p className="mb-3 text-[12px] text-ink-3">Quarterly figures could not be loaded; showing annual reports only.</p>
          )}
          <FinancialsChart periods={periods} />
        </Card>

        {waterfallSteps(latest).length > 0 && (
          <section>
            <Card context={latest.label} dot="ok" title="From revenue to profit">
              <ProfitWaterfall period={latest} />
            </Card>
          </section>
        )}

        {margins}
        <CashAndDebtChart annual={data.annual} />
        <AssetsLiabilitiesChart annual={data.annual} />
      </Halves>

      <Card
        flush
        context={`${active === 'annual' ? 'Fiscal years' : 'Quarters'} · ${SOURCE}`}
        dot="ok"
        title="Statements"
        right={<Segmented label="Statement" options={STATEMENT_OPTIONS} value={statement.key} onChange={setStatementKey} />}
      >
        {hasRows ? (
          <StatementTable statement={statement} periods={periods} allPeriods={allPeriods} />
        ) : (
          <p className="px-[18px] text-[13px] text-ink-3">No {statement.label.toLowerCase()} figures for these periods.</p>
        )}
      </Card>
    </>
  )
}

export default function FinancialsTab({ symbol, fundamentals }) {
  const statements = useStatements(symbol)
  const company = fundamentals.data?.available ? fundamentals.data : null

  return (
    <div className="flex flex-col gap-[var(--sd-gap,12px)]">
      <Statements
        key={symbol}
        symbol={symbol}
        statements={statements}
        margins={<QuarterlyTrendsChart trends={company?.quarterly_trends} />}
      />
    </div>
  )
}
