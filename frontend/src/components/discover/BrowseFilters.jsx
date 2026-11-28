import { useState } from 'react'

import { EMPTY_FILTERS, MIN_FALL, MIN_YIELD, QUALITY_OPTIONS, VALUATION_OPTIONS, filtersActive, toggled } from '../../lib/discoverBrowse'

const SECTORS_SHOWN = 6

function Option({ label, count, checked, onChange }) {
  return (
    <label className="flex min-h-[32px] cursor-pointer items-center gap-2.5 rounded-md text-[14px] text-ink-2 hover:text-ink">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-[var(--sd-accent)]" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count == null ? null : <span className="text-[12px] text-ink-3 num">{count}</span>}
    </label>
  )
}

function Group({ title, children }) {
  return (
    <fieldset className="flex flex-col gap-0.5 border-t border-line py-4">
      <legend className="float-left mb-2 w-full text-[13px] font-bold text-ink">{title}</legend>
      {children}
    </fieldset>
  )
}

function ListGroup({ title, options, selected, counts, onChange }) {
  return (
    <Group title={title}>
      {options.map((option) => (
        <Option
          key={option.value}
          label={option.label}
          count={counts?.[option.value] ?? 0}
          checked={selected.includes(option.value)}
          onChange={() => onChange(toggled(selected, option.value))}
        />
      ))}
    </Group>
  )
}

export default function BrowseFilters({ filters, facets, onChange }) {
  const [allSectors, setAllSectors] = useState(false)
  const set = (patch) => onChange({ ...filters, ...patch })
  const sectors = Object.entries(facets?.sector ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: value, count }))
  const chosenHidden = sectors.slice(SECTORS_SHOWN).filter((sector) => filters.sector.includes(sector.value))
  const shown = allSectors ? sectors : [...sectors.slice(0, SECTORS_SHOWN), ...chosenHidden]
  const hiddenCount = sectors.length - shown.length

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between pb-3">
        <span className="text-[15px] font-bold text-ink">Filters</span>
        {filtersActive(filters) ? (
          <button type="button" onClick={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })} className="text-[13px] font-semibold text-ink-2 hover:text-ink">
            Clear
          </button>
        ) : null}
      </div>
      <ListGroup title="Position in usual range" options={VALUATION_OPTIONS} selected={filters.valuation} counts={facets?.valuation} onChange={(valuation) => set({ valuation })} />
      <ListGroup title="Company quality" options={QUALITY_OPTIONS} selected={filters.quality} counts={facets?.quality} onChange={(quality) => set({ quality })} />
      <Group title="Sector">
        {shown.map((sector) => (
          <Option
            key={sector.value}
            label={sector.label}
            count={sector.count}
            checked={filters.sector.includes(sector.value)}
            onChange={() => set({ sector: toggled(filters.sector, sector.value) })}
          />
        ))}
        {hiddenCount > 0 || allSectors ? (
          <button
            type="button"
            aria-expanded={allSectors}
            onClick={() => setAllSectors(!allSectors)}
            className="mt-1 self-start text-[13px] font-semibold text-ink hover:underline"
          >
            {allSectors ? 'Show fewer' : `Show ${hiddenCount} more`}
          </button>
        ) : null}
      </Group>
      <Group title="More">
        <Option label={`Pays ${MIN_YIELD}% or more`} checked={filters.minYield != null} onChange={() => set({ minYield: filters.minYield == null ? MIN_YIELD : null })} />
        <Option label={`${MIN_FALL}% or more below its high`} checked={filters.minFall != null} onChange={() => set({ minFall: filters.minFall == null ? MIN_FALL : null })} />
        <Option label="Not in my portfolio" checked={filters.notHeld} onChange={() => set({ notHeld: !filters.notHeld })} />
      </Group>
    </div>
  )
}
