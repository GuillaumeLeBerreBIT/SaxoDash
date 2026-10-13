import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { useFundamentals } from '../../api/queries'
import { analystRating } from '../../lib/analystRating'
import { SESSION_LABEL, daysUntil } from '../../lib/earnings'
import { fmtCompact, fmtMonthYear, fmtShares } from '../../lib/format'
import { trailingReturns } from '../../lib/performance'
import { isEtf } from '../../lib/research'
import { seasonalSeries } from '../../lib/seasonals'
import { technicalRating } from '../../lib/technicalRating'
import { Card, Skeleton } from '../ui'
import AnalystCounts from './AnalystCounts'
import EarningsDots from './EarningsDots'
import PerformanceTiles from './PerformanceTiles'
import RatingGauge from './RatingGauge'
import SeasonalsChart from './SeasonalsChart'

const AVERAGE_VOLUME_SESSIONS = 30

function averageVolume(bars) {
  const traded = bars.slice(-AVERAGE_VOLUME_SESSIONS).filter((bar) => bar.volume > 0)
  if (!traded.length) return 0
  return traded.reduce((sum, bar) => sum + bar.volume, 0) / traded.length
}

const upcoming = (next) => (next?.date && daysUntil(next.date) !== 'past' ? next : null)

function nextEarningsParts(next) {
  if (!next) return null
  const when = daysUntil(next.date)
  return { day: when.charAt(0).toUpperCase() + when.slice(1), session: SESSION_LABEL[next.session] ?? null }
}

function NextEarnings({ day, session }) {
  return (
    <>
      <span className="block whitespace-nowrap">{day}</span>
      {session && <span className="block whitespace-nowrap text-[var(--fig-2xs)] text-zinc-500">{session}</span>}
    </>
  )
}

function Section({ title, note, children }) {
  return (
    <section className="border-t border-white/[0.06] pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-[var(--fig-sm)] font-medium text-zinc-200">{title}</h2>
        {note && <span className="text-[var(--fig-2xs)] text-zinc-500">{note}</span>}
      </div>
      {children}
    </section>
  )
}

export default function SymbolPanel({ symbol, instrument, bars, earnings, href }) {
  const hasCompany = Boolean(instrument) && !isEtf(instrument)
  const fundamentals = useFundamentals(hasCompany ? symbol : '')
  const company = hasCompany && fundamentals.data?.available ? fundamentals.data : null
  const reported = hasCompany && earnings.data?.available ? earnings.data : null
  const nextReport = upcoming(reported?.next)

  const returns = useMemo(() => trailingReturns(bars), [bars])
  const seasons = useMemo(() => seasonalSeries(bars), [bars])
  const technical = useMemo(() => technicalRating(bars), [bars])
  const analyst = analystRating(company?.recommendation)
  const loadingCompany = hasCompany && fundamentals.isLoading

  const latestVolume = bars.length ? bars[bars.length - 1].volume : 0
  const typicalVolume = averageVolume(bars)
  const stats = [
    ['next-earnings', 'Next earnings', nextEarningsParts(nextReport)],
    ['volume', 'Volume', latestVolume > 0 ? fmtShares(latestVolume) : null],
    ['average-volume', 'Average volume (30D)', typicalVolume > 0 ? fmtShares(typicalVolume) : null],
    ['market-cap', 'Market cap', company?.market_cap == null ? null : fmtCompact(company.market_cap)],
  ].filter(([, , value]) => value != null)

  const hasReturns = returns.some((row) => row.pct != null)
  const hasEarnings = Boolean(reported?.history?.some((row) => row.eps_actual != null) || nextReport?.eps_estimate != null)
  const hasAnything =
    stats.length > 0 || hasReturns || hasEarnings || analyst || technical || seasons.length > 0 || loadingCompany
  if (!hasAnything) return null

  return (
    <Card>
      <Section title={symbol} note={<Link to={href} className="hover:text-zinc-300">Open in Research →</Link>}>
        {stats.length > 0 && (
          <dl className="text-[var(--fig-xs)]">
            {stats.map(([key, label, value]) => (
              <div key={key} className="flex justify-between gap-3 py-1">
                <dt className="whitespace-nowrap text-zinc-400">{label}</dt>
                <dd data-stat={key} className="num font-mono text-zinc-100 text-right">
                  {typeof value === 'object' ? <NextEarnings {...value} /> : value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      {hasReturns && (
        <Section title="Performance">
          <PerformanceTiles returns={returns} />
        </Section>
      )}

      {hasEarnings && (
        <Section title="Earnings" note="EPS vs estimate">
          <EarningsDots history={reported.history} next={nextReport} />
        </Section>
      )}

      {loadingCompany && <Skeleton className="h-24 w-full mt-3" data-testid="symbol-panel-loading" />}

      {analyst && (
        <Section title="Analyst rating">
          <RatingGauge title="Analyst rating" fraction={analyst.fraction} label={analyst.label} />
          <AnalystCounts rows={analyst.counts.map((row) => [row.label, row.count])} />
          <p className="mt-1 text-center text-[var(--fig-2xs)] text-zinc-500">
            {analyst.period ? `${analyst.total} analysts · as of ${fmtMonthYear(analyst.period)}` : `${analyst.total} analysts`}
          </p>
        </Section>
      )}

      {technical && (
        <Section title="Technicals" note="Daily">
          <RatingGauge title="Technicals" fraction={technical.fraction} label={technical.label} />
          <AnalystCounts
            rows={[
              ['Sell', technical.sell],
              ['Neutral', technical.neutral],
              ['Buy', technical.buy],
            ]}
          />
          <p className="mt-1 text-center text-[var(--fig-2xs)] text-zinc-500">
            {technical.votes.map((vote) => vote.label).join(', ')}
          </p>
        </Section>
      )}

      {seasons.length > 0 && (
        <Section title="Seasonals" note="Return from January">
          <SeasonalsChart series={seasons} />
        </Section>
      )}
    </Card>
  )
}
