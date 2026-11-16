import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useInvestorHub, useInvestors, usePositions } from '../api/queries'
import { Alert, Button, Segmented, Skeleton } from '../components/ui'
import CongressDirectory from '../components/congress/CongressDirectory'
import AddInvestorDialog from '../components/investors/AddInvestorDialog'
import InvestorDirectory from '../components/investors/InvestorDirectory'
import LimitsNote from '../components/investors/LimitsNote'
import Shelf from '../components/investors/Shelf'
import { FundFlows, Following } from '../components/investors/HubSections'
import { investorsHeadline } from '../lib/investorsBrief'
import { hubSubtitle } from '../lib/investorHub'

const TABS = [{ value: 'funds', label: 'Funds' }, { value: 'congress', label: 'Congress' }]

const CONGRESS_SUBTITLE = 'House members’ disclosed stock trades, copied at the midpoint of each reported range'

const NO_SIGNALS = 'No cross-fund signals yet. They appear once investors have two quarters imported.'

function SignalsState({ hub }) {
  if (hub.error) return <Alert tone="warning">Could not load this quarter's signals. {hub.error.message}</Alert>
  if (hub.isLoading || !hub.data) return <Skeleton className="h-40" />
  if (hub.data.shelves.length === 0) return <p className="text-[13px] text-ink-3">{NO_SIGNALS}</p>
  return null
}

const SHOWN_ELSEWHERE = new Set(['following', 'convergent-buys', 'most-sold', 'new-bets'])
const NO_POSITIONS = []

const shelfItems = (hub, key) => hub.data?.shelves?.find((shelf) => shelf.key === key)?.items ?? []

function Hub({ hub, held }) {
  if (hub.error || !hub.data) return null
  const following = shelfItems(hub, 'following')
  const rest = hub.data.shelves.filter((shelf) => !SHOWN_ELSEWHERE.has(shelf.key))
  return (
    <>
      <Following investors={following} held={held} />
      <FundFlows bought={shelfItems(hub, 'convergent-buys')} sold={shelfItems(hub, 'most-sold')} held={held} />
      {rest.map((shelf) => <Shelf key={shelf.key} shelf={shelf} />)}
    </>
  )
}

export default function Investors() {
  const [adding, setAdding] = useState(false)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'congress' ? 'congress' : 'funds'
  const pick = (key) => {
    const next = new URLSearchParams(params)
    if (key === 'funds') next.delete('tab')
    else next.set('tab', key)
    setParams(next, { replace: true })
  }
  const funds = tab === 'funds'
  const hub = useInvestorHub({ enabled: funds })
  const { data: cards = [], isLoading, error } = useInvestors({ enabled: funds })
  const signals = funds ? <SignalsState hub={hub} /> : null
  const positions = usePositions().data ?? NO_POSITIONS
  const held = useMemo(() => new Set(positions.map((position) => position.ticker)), [positions])
  const headline = funds ? investorsHeadline(hub.data, shelfItems(hub, 'following')) : null

  return (
    <div className="flex flex-col gap-[var(--sd-gap,12px)]">
      <h1 className="sr-only">Investors</h1>
      <section aria-label="Investors" className="flex flex-col gap-4 pt-2 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-[820px] flex-col gap-2">
          <span className="text-[14px] font-medium text-ink-2">{funds ? hubSubtitle(hub.data) : CONGRESS_SUBTITLE}</span>
          {headline ? (
            <p data-testid="investors-headline" className="text-[24px] font-bold leading-tight tracking-tight text-ink md:text-[32px] [text-wrap:balance]">
              {headline}
            </p>
          ) : null}
          {signals}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Investor type" options={TABS} value={tab} onChange={pick} />
          {funds ? <Button onClick={() => setAdding(true)}>Add an investor</Button> : null}
        </div>
      </section>
      {funds ? (
        <>
          <Hub hub={hub} held={held} />
          <InvestorDirectory cards={cards} isLoading={isLoading} error={error} />
          <LimitsNote />
        </>
      ) : (
        <CongressDirectory />
      )}
      {adding ? <AddInvestorDialog onClose={() => setAdding(false)} /> : null}
    </div>
  )
}
