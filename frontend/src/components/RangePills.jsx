/* eslint-disable react-refresh/only-export-components */
export const RANGES = ['1M', '3M', '6M', '1Y', 'ALL']

export function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11.5px] px-2.5 py-1 rounded-md font-medium transition-colors ${
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}

export function RangePills({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {RANGES.map((r) => (
        <Pill key={r} active={value === r} onClick={() => onChange(r)}>
          {r}
        </Pill>
      ))}
    </div>
  )
}
