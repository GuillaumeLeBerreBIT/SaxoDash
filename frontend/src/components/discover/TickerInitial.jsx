export default function TickerInitial({ ticker, size }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="shrink-0 rounded bg-zinc-800 flex items-center justify-center text-[var(--fig-2xs)] font-semibold text-zinc-400"
    >
      {ticker ? ticker[0].toUpperCase() : null}
    </span>
  )
}
