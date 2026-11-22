import { useDeferredValue, useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'

import { useInstrumentSearch } from '../../api/queries'
import { ADDED_LIMIT } from '../../lib/compare'
import { instrumentKey, rankInstrumentResults } from '../../lib/research'
import { Chip, Input, Segmented } from '../ui'

const MAIN_AS = [
  { value: 'candles', label: 'Candles' },
  { value: 'line', label: 'Line' },
]

function SymbolSearch({ onChart, onPick, onClose }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const { data: results = [], isError } = useInstrumentSearch(deferredQuery)
  const ranked = rankInstrumentResults(results, deferredQuery)

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-label="Add symbol to compare"
      className="fixed inset-0 z-50 flex flex-col gap-2 bg-pane p-4 min-[760px]:absolute min-[760px]:inset-auto min-[760px]:top-full min-[760px]:left-0 min-[760px]:mt-1 min-[760px]:w-80 min-[760px]:rounded-lg min-[760px]:border min-[760px]:border-line min-[760px]:bg-raised min-[760px]:p-2 min-[760px]:shadow-lg"
    >
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a stock or ETF"
          aria-label="Search a symbol to compare"
          className="flex-1"
        />
        <button type="button" aria-label="Close" onClick={onClose} className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-ink-3 hover:text-ink hover:bg-hover">
          <X size={16} />
        </button>
      </div>
      {isError ? <p className="px-1 text-[12px] text-warn-text">Search unavailable — reconnect Saxo</p> : null}
      <div className="flex-1 min-h-0 overflow-y-auto min-[760px]:max-h-64">
        {ranked.map((result) => {
          const taken = onChart.has(instrumentKey(result.uic, result.asset_type))
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

export default function CompareControls({ symbol, compare, suggestions, addedLeft, onChart, onChange }) {
  const [searching, setSearching] = useState(false)
  const close = () => setSearching(false)

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
      <div className="relative">
        <button
          type="button"
          disabled={addedLeft <= 0}
          onClick={() => setSearching(true)}
          className="inline-flex items-center gap-1.5 h-11 md:h-7 px-[11px] rounded-full border border-dashed border-ink-3 text-[12px] font-semibold text-ink-2 hover:text-ink disabled:opacity-50"
        >
          <Plus size={12} />
          Add symbol
          <span className="font-normal text-ink-3">{addedLeft > 0 ? `${addedLeft} of ${ADDED_LIMIT} left` : 'none left'}</span>
        </button>
        {searching ? (
          <SymbolSearch
            onChart={onChart}
            onClose={close}
            onPick={(instrument) => {
              onChange({ added: [...compare.added, instrument] })
              close()
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
