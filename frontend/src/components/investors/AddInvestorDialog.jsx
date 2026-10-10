import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAddInvestor, useInvestorSearch } from '../../api/queries'
import { Alert, Button, Input, Modal, Skeleton } from '../ui'
import { fmtFiledDate } from '../../lib/investors'
import { useDebouncedValue } from '../../lib/useDebouncedValue'

const MIN_QUERY = 3
const HINT = 'Type at least 3 characters of a fund or manager name.'

function Action({ filer, onAdd, pending }) {
  if (filer.tracked) {
    return <Link to={`/investors/${filer.slug}`} className="text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">Open</Link>
  }
  if (!filer.last_13f) return null
  return <Button size="sm" disabled={pending} aria-label={`Add ${filer.name}`} onClick={() => onAdd(filer.cik)}>Add</Button>
}

function Filer({ filer, onAdd, pending }) {
  return (
    <li className="py-2 flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-[var(--fig-sm)] text-zinc-100">{filer.name}</span>
        <span className="block text-[var(--fig-2xs)] text-zinc-500">
          {filer.tracked ? 'Already tracked' : filer.last_13f ? `Last 13F ${fmtFiledDate(filer.last_13f)}` : 'No 13F on file'}
        </span>
      </span>
      <Action filer={filer} onAdd={onAdd} pending={pending} />
    </li>
  )
}

function Results({ query, search, onAdd, pending }) {
  if (query.length < MIN_QUERY) return <p className="text-[var(--fig-xs)] text-zinc-500">{HINT}</p>
  if (search.error) return <Alert>{search.error.message}</Alert>
  if (search.isFetching || !search.data) return <Skeleton className="h-24" />
  if (search.data.length === 0) return <p className="text-[var(--fig-xs)] text-zinc-500">{`No 13F filer matches “${query}”.`}</p>
  return (
    <ul className="divide-y divide-white/[0.06] max-h-72 overflow-y-auto">
      {search.data.map((filer) => <Filer key={filer.cik} filer={filer} onAdd={onAdd} pending={pending} />)}
    </ul>
  )
}

export default function AddInvestorDialog({ onClose }) {
  const [text, setText] = useState('')
  const query = useDebouncedValue(text.trim())
  const search = useInvestorSearch(query)
  const add = useAddInvestor()
  const navigate = useNavigate()

  const addFiler = (cik) =>
    add.mutate(cik, {
      onSuccess: (card) => {
        onClose()
        navigate(`/investors/${card.slug}`)
      },
    })

  return (
    <Modal title="Add investor" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Input
          type="search"
          autoFocus
          aria-label="Search 13F filers"
          placeholder="Fund or manager name"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {add.error ? <Alert>{add.error.message}</Alert> : null}
        <Results query={query} search={search} onAdd={addFiler} pending={add.isPending} />
        <p className="text-[var(--fig-2xs)] text-zinc-500">
          Searches SEC EDGAR for institutional managers that file form 13F. Five years of filings are imported in the background.
        </p>
      </div>
    </Modal>
  )
}
