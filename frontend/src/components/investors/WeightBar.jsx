export default function WeightBar({ weight, max, className = '' }) {
  const width = max > 0 ? `${Math.min(100, (weight / max) * 100)}%` : '0%'
  return (
    <span aria-hidden="true" className={`block h-1.5 rounded-full bg-track overflow-hidden ${className}`}>
      <span data-fill className="block h-full rounded-full bg-ink" style={{ width }} />
    </span>
  )
}
