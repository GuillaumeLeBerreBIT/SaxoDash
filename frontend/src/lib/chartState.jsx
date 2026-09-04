import { isNotConnected } from '../api/client'
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
  // A missing Saxo connection is a prompt to reconnect, not a failure. Handled
  // here rather than by each caller, which is why only one of five used to.
  if (isNotConnected(error))
    return (
      <ChartPlaceholder height={height}>
        {error.detail ?? 'Saxo is not connected.'} There is no price history to chart yet.
      </ChartPlaceholder>
    )
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
