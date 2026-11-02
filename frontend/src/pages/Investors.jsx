import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useInvestorHub, useInvestors } from '../api/queries'
import { Alert, Button, Card, Segmented, Skeleton } from '../components/ui'
import CongressDirectory from '../components/congress/CongressDirectory'
import AddInvestorDialog from '../components/investors/AddInvestorDialog'
import InvestorDirectory from '../components/investors/InvestorDirectory'
import LimitsNote from '../components/investors/LimitsNote'
import Shelf from '../components/investors/Shelf'
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

function Shelves({ hub }) {
  if (hub.error || !hub.data) return null
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
  const funds = tab === 'funds'
  const hub = useInvestorHub({ enabled: funds })
  const { data: cards = [], isLoading, error } = useInvestors({ enabled: funds })
  const signals = funds ? <SignalsState hub={hub} /> : null

  return (
    <div className="flex flex-col gap-[var(--sd-gap,12px)]">
      <h1 className="sr-only">Investors</h1>
      <Card
        dot={funds && hub.error ? 'warn' : 'ok'}
        context={funds ? hubSubtitle(hub.data) : CONGRESS_SUBTITLE}
        title={funds ? 'Smart money' : 'Congress'}
        right={(
          <>
            <Segmented label="Investor type" options={TABS} value={tab} onChange={pick} />
            {funds ? <Button size="sm" onClick={() => setAdding(true)}>Add investor</Button> : null}
          </>
        )}
      >
        {signals}
      </Card>
      {funds ? (
        <>
          <Shelves hub={hub} />
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
