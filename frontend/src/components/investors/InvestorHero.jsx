import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useStopTracking } from '../../api/queries'
import { Alert, Button, Select } from '../ui'
import FollowButton from './FollowButton'
import InvestorAvatar from './InvestorAvatar'
import StyleChips from './StyleChips'
import { quarterLabel } from '../../lib/investors'

function StopTracking({ detail }) {
  const [confirming, setConfirming] = useState(false)
  const navigate = useNavigate()
  const stop = useStopTracking()
  if (!confirming) return <Button size="sm" onClick={() => setConfirming(true)}>Stop tracking</Button>
  return (
    <span className="flex items-center gap-2">
      <Button size="sm" variant="destructive" disabled={stop.isPending} onClick={() => stop.mutate(detail.slug, { onSuccess: () => navigate('/investors') })}>
        {`Remove ${detail.name}`}
      </Button>
      <Button size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
      {stop.error ? <Alert className="py-1">{stop.error.message}</Alert> : null}
    </span>
  )
}

export default function InvestorHero({ detail, onQuarter }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-3 flex-wrap">
        <InvestorAvatar name={detail.name} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[var(--fig-xl)] font-semibold text-zinc-50">{detail.name}</h1>
          <p className="text-[var(--fig-sm)] text-zinc-400">{detail.firm}</p>
          {detail.stale && detail.quarter ? (
            <p className="text-[var(--fig-xs)] text-amber-400 mt-0.5">{`No 13F since ${quarterLabel(detail.quarters[0])}`}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {detail.quarters.length > 0 ? (
            <label className="flex items-center gap-2 text-[var(--fig-xs)] text-zinc-500">
              Quarter
              <Select aria-label="Quarter" value={detail.quarter} onChange={(e) => onQuarter(e.target.value === detail.quarters[0] ? null : e.target.value)}>
                {detail.quarters.map((q) => <option key={q} value={q}>{quarterLabel(q)}</option>)}
              </Select>
            </label>
          ) : null}
          <FollowButton investor={detail} labelled className="border border-white/10 px-2.5 h-9" />
          {detail.curated ? null : <StopTracking detail={detail} />}
        </div>
      </div>
      <StyleChips styles={detail.styles} />
      {detail.blurb ? <p className="text-[var(--fig-sm)] text-zinc-400 max-w-[70ch]">{detail.blurb}</p> : null}
    </header>
  )
}
