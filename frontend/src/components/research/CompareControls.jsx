import { useDeferredValue, useState } from 'react'
import { Plus } from 'lucide-react'

import { useInstrumentSearch } from '../../api/queries'
import { ADDED_LIMIT, withColorSlots } from '../../lib/compare'
import { instrumentKey, rankInstrumentResults } from '../../lib/research'
import { Dialog } from '../overlays'
import { Chip, Input, Segmented } from '../ui'

const MAIN_AS = [
  { value: 'candles', label: 'Candles' },
  { value: 'line', label: 'Line' },
]

function SymbolSearch({ takenKeys, onPick }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const { data: results = [], isError } = useInstrumentSearch(deferredQuery)
  const ranked = rankInstrumentResults(results, deferredQuery)

  return (
    <div className="flex flex-col gap-2">
      <Input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search a stock or ETF"
        aria-label="Search a symbol to compare"
      />
      {isError ? <p className="px-1 text-[12px] text-warn-text">Search unavailable — reconnect Saxo</p> : null}
      <div className="max-h-[60vh] overflow-y-auto">
        {ranked.map((result) => {
          const taken = takenKeys.has(instrumentKey(result.uic, result.asset_type))
          return (
            <button
              key={`${result.uic}-${result.asset_type}`}
              type="button"
              disabled={taken}
              onClick={() => onPick({ symbol: result.symbol, uic: result.uic, assetType: result.asset_type })}
              className="flex items-baseline gap-1.5 w-full text-left px-2.5 py-2 rounded-md text-[13px] text-ink hover:bg-hover disabled:text-ink-3 disabled:hover:bg-transparent"
            >
              <span className="shrink-0 font-semibold">{result.symbol}</span>
              <span className="text-ink-3 truncate">{result.description}</span>
              {taken ? <span className="ml-auto shrink-0 text-[11px] text-ink-3">On the chart</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function CompareControls({ symbol, compare, suggestions, addedLeft, takenKeys, onChange }) {
  const [searching, setSearching] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line">
      <Segmented label={`${symbol} as`} options={MAIN_AS} value={compare.mainAs} onChange={(mainAs) => onChange({ mainAs })} />
      {suggestions.length > 0 ? <span role="separator" className="w-px h-5 bg-line" /> : null}
      {suggestions.map((suggestion) => (
        <span key={suggestion.key} title={suggestion.title}>
          <Chip active={compare[suggestion.key]} onClick={() => onChange({ [suggestion.key]: !compare[suggestion.key] })}>
            {suggestion.label}
          </Chip>
        </span>
      ))}
      <Chip disabled={addedLeft <= 0} onClick={() => setSearching(true)} className="rounded-full! border border-dashed border-ink-3">
        <Plus size={12} aria-hidden="true" />
        Add symbol
        <span className="font-normal text-ink-3">{addedLeft > 0 ? `${addedLeft} of ${ADDED_LIMIT} left` : 'none left'}</span>
      </Chip>
      <Dialog open={searching} onOpenChange={setSearching} title="Add symbol to compare" placement="top" fullScreenOnPhone>
        <SymbolSearch
          takenKeys={takenKeys}
          onPick={(instrument) => {
            onChange({ added: withColorSlots([...compare.added, instrument]) })
            setSearching(false)
          }}
        />
      </Dialog>
    </div>
  )
}
