import { BEAT, ESTIMATE, MISS, REPORTED, TARGET_TICK, TRACK } from '../lib/charts'

/** A compact bullet bar: the reported `actual` as a filled measure against
 *  the consensus `estimate` as a target tick. Bars are magnitude-scaled to
 *  the larger of the two, so the fill length reads as "how far from target".
 *  With no `actual` yet, only the muted target tick shows.
 *
 *  Pure SVG, no chart library - it renders inline in a table row. */
export default function BulletBar({ actual, estimate, width = 72, height = 14, className = '' }) {
  const hasEstimate = estimate != null && Number.isFinite(estimate)
  const hasActual = actual != null && Number.isFinite(actual)
  if (!hasEstimate && !hasActual) return null

  const span = Math.max(Math.abs(actual ?? 0), Math.abs(estimate ?? 0)) || 1
  const pad = 1
  const usable = width - pad * 2
  const frac = (v) => pad + (Math.abs(v) / (span * 1.12)) * usable
  const mid = height / 2
  // > estimate beat, < missed, exactly on it reported-but-neutral.
  const measureFill =
    !hasActual || !hasEstimate || actual === estimate
      ? REPORTED
      : actual > estimate
        ? BEAT
        : MISS

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={
        hasActual
          ? `Actual ${actual}, estimate ${hasEstimate ? estimate : 'n/a'}`
          : `Estimate ${estimate}, not yet reported`
      }
    >
      <rect x={pad} y={mid - 3} width={usable} height={6} rx={3} fill={TRACK} />
      {hasActual && (
        <rect
          x={pad}
          y={mid - 3}
          width={Math.max(2, frac(actual) - pad)}
          height={6}
          rx={3}
          fill={measureFill}
        />
      )}
      {hasEstimate && (
        <rect
          x={frac(estimate) - 1}
          y={mid - 6}
          width={2}
          height={12}
          rx={1}
          fill={hasActual ? TARGET_TICK : ESTIMATE}
        />
      )}
    </svg>
  )
}
