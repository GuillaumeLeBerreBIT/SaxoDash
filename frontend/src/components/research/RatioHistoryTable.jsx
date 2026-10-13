import { Fragment } from 'react'

import { RATIO_GROUPS, fmtRatio, periodLabels } from '../../lib/ratioHistory'

export default function RatioHistoryTable({ history, current }) {
  const points = history ?? []
  const labels = periodLabels(points)
  const groups = RATIO_GROUPS.map((group) => ({
    ...group,
    ratios: group.ratios.filter((ratio) => points.some((point) => point[ratio.key] != null)),
  })).filter((group) => group.ratios.length > 0)
  if (!groups.length) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[var(--fig-xs)]">
        <thead>
          <tr className="text-zinc-500">
            <th scope="col" className="text-left font-medium py-2 pr-4">Ratio</th>
            {points.map((point, index) => (
              <th key={point.period} scope="col" className="text-right font-medium py-2 pl-4">
                {labels[index]}
              </th>
            ))}
            <th scope="col" className="text-right font-medium py-2 pl-4 text-zinc-300">Current</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              <tr>
                <td
                  colSpan={points.length + 2}
                  role="presentation"
                  className="pt-3 pb-1 text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-500 font-medium"
                >
                  {group.label}
                </td>
              </tr>
              {group.ratios.map((ratio) => (
                <tr key={ratio.key} className="border-t border-white/[0.06]">
                  <th scope="row" className="text-left font-normal text-zinc-400 py-2 pr-4 whitespace-nowrap">
                    {ratio.label}
                  </th>
                  {points.map((point) => (
                    <td key={point.period} className="text-right num font-mono text-zinc-300 py-2 pl-4">
                      {fmtRatio(point[ratio.key], ratio.format)}
                    </td>
                  ))}
                  <td className="text-right num font-mono text-zinc-100 py-2 pl-4">
                    {fmtRatio(ratio.current ? current?.[ratio.current] : null, ratio.format)}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
