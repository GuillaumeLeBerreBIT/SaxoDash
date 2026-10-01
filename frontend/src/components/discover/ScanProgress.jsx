import { scanProgressLabel } from '../../lib/discover'

export default function ScanProgress({ progress }) {
  if (!progress) return null
  const label = scanProgressLabel(progress)
  const known = progress.total != null && progress.total > 0
  const width = known ? `${Math.round((progress.done / progress.total) * 100)}%` : '30%'

  return (
    <div className="space-y-1.5">
      <div className="text-[var(--fig-xs)] text-zinc-400 num">{label}</div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={known ? 0 : undefined}
        aria-valuemax={known ? progress.total : undefined}
        aria-valuenow={known ? progress.done : undefined}
        className="h-1 w-full overflow-hidden rounded-full bg-zinc-800"
      >
        <div
          data-testid="scan-progress-fill"
          className={`h-full rounded-full bg-blue-500 transition-[width] duration-500 ${known ? '' : 'animate-pulse'}`}
          style={{ width }}
        />
      </div>
    </div>
  )
}
