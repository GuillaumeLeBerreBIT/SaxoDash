import { ChartPlaceholder } from '../components/ui'

/** Decides what a chart should show before it shows a plot.
 *
 *  Returns null when the data is fine and the caller should render normally.
 *  `minPoints` is 2 for line and area charts, which cannot draw a shape from a
 *  single point, and 1 for bar and pie charts, which can.
 *
 *  Lives here rather than in ui.jsx because that file exports only components,
 *  and mixing a plain function in breaks React Fast Refresh.
 */
export function chartPlaceholderFor({ isLoading, error, data, minPoints = 1, height = 260 }) {
  if (isLoading) return <ChartPlaceholder height={height}>Loading…</ChartPlaceholder>
  if (error)
    return (
      <ChartPlaceholder height={height} tone="red">
        Failed to load chart data
      </ChartPlaceholder>
    )

  const count = data?.length ?? 0
  if (count === 0) return <ChartPlaceholder height={height}>No data yet</ChartPlaceholder>
  if (count < minPoints)
    return (
      <ChartPlaceholder height={height}>
        Only one day of history so far — this chart needs at least two to draw a line.
      </ChartPlaceholder>
    )
  return null
}
