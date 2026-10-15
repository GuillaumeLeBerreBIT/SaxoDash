import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useInvestorHub, useInvestors } from '../api/queries'
import { Alert, Button, PageHeader, Skeleton, TabButton, TabList } from '../components/ui'
import CongressDirectory from '../components/congress/CongressDirectory'
import AddInvestorDialog from '../components/investors/AddInvestorDialog'
import InvestorDirectory from '../components/investors/InvestorDirectory'
import LimitsNote from '../components/investors/LimitsNote'
import Shelf from '../components/investors/Shelf'
import { hubSubtitle } from '../lib/investorHub'

const TABS = [['funds', 'Funds'], ['congress', 'Congress']]

const CONGRESS_SUBTITLE = 'House members’ disclosed stock trades, copied at the midpoint of each reported range'

const NO_SIGNALS = 'No cross-fund signals yet. They appear once investors have two quarters imported.'

function Shelves({ hub }) {
  if (hub.error) return <Alert>Could not load this quarter's signals. {hub.error.message}</Alert>
  if (hub.isLoading || !hub.data) return <Skeleton className="h-40" />
  if (hub.data.shelves.length === 0) return <p className="text-[var(--fig-sm)] text-zinc-500">{NO_SIGNALS}</p>
  return hub.data.shelves.map((shelf) => <Shelf key={shelf.key} shelf={shelf} />)
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
  const hub = useInvestorHub()
  const { data: cards = [], isLoading, error } = useInvestors()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Investors"
        subtitle={tab === 'congress' ? CONGRESS_SUBTITLE : hubSubtitle(hub.data)}
        right={tab === 'funds' ? <Button size="sm" onClick={() => setAdding(true)}>Add investor</Button> : null}
      />
      <TabList label="Investor type">
        {TABS.map(([key, label]) => (
          <TabButton key={key} active={tab === key} onClick={() => pick(key)}>{label}</TabButton>
        ))}
      </TabList>
      {tab === 'congress' ? (
        <CongressDirectory />
      ) : (
        <>
          <Shelves hub={hub} />
          <InvestorDirectory cards={cards} isLoading={isLoading} error={error} />
          <LimitsNote />
        </>
      )}
      {adding ? <AddInvestorDialog onClose={() => setAdding(false)} /> : null}
    </div>
  )
}
