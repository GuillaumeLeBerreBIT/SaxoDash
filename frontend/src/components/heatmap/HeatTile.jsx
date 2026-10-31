import { useChartColors } from '../../theme/useChartColors'
import { fmtPct } from '../../lib/format'

export default function HeatTile({
  as: Tag = 'button',
  ticker,
  pct,
  fill,
  level = 'full',
  active = false,
  marker = null,
  className = '',
  style,
  ...rest
}) {
  const c = useChartColors()
  const buttonProps = Tag === 'button' ? { type: 'button' } : {}
  return (
    <Tag
      {...buttonProps}
      {...rest}
      aria-current={active || undefined}
      className={`overflow-hidden rounded-sm flex flex-col items-center justify-center text-center leading-tight outline-none focus-visible:ring-2 focus-visible:ring-focus hover:brightness-125 ${
        active ? 'ring-1 ring-accent' : ''
      } ${className}`}
      style={{ ...style, background: fill ?? c.track }}
    >
      {level === 'none' ? null : (
        <span className="flex items-center gap-1 max-w-full px-1 truncate text-[var(--fig-xs)] font-medium text-ink">
          {ticker}
          {marker}
        </span>
      )}
      {level === 'full' ? (
        <span className="text-[var(--fig-2xs)] num font-mono text-ink">{fmtPct(pct, { decimals: 1 })}</span>
      ) : null}
    </Tag>
  )
}
