import { Fragment } from 'react'

import { RATIO_GROUPS, fmtRatio, periodLabels } from '../../lib/ratioHistory'
import { useScrollToEnd } from '../../lib/useScrollToEnd'

export default function RatioHistoryTable({ history, current }) {
  const points = history ?? []
  const labels = periodLabels(points)
  const scroller = useScrollToEnd(points.length, points[0]?.period, points.at(-1)?.period)
  const groups = RATIO_GROUPS.map((group) => ({
    ...group,
    ratios: group.ratios.filter((ratio) => points.some((point) => point[ratio.key] != null)),
  })).filter((group) => group.ratios.length > 0)
  if (!groups.length) return null

  return (
    <div ref={scroller} className="overflow-x-auto">
      <table aria-label="Ratios by fiscal year" className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="text-[12px] text-ink-3">
            <th scope="col" className="sticky left-0 z-[1] bg-pane text-left font-medium h-[30px] pl-[18px] pr-4">Ratio</th>
            {points.map((point, index) => (
              <th key={point.period} scope="col" className="text-right font-medium h-[30px] pl-4">
                {labels[index]}
              </th>
            ))}
            <th scope="col" className="text-right font-medium h-[30px] pl-4 pr-[18px] text-ink-2">Current</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              <tr>
                <td
                  colSpan={points.length + 2}
                  role="presentation"
                  className="pt-3 pb-1 pl-[18px] text-[13px] font-bold text-ink"
                >
                  <span className="sticky left-[18px] inline-block">{group.label}</span>
                </td>
              </tr>
              {group.ratios.map((ratio) => (
                <tr key={ratio.key} className="border-t border-line">
                  <th scope="row" className="sticky left-0 z-[1] bg-pane text-left font-normal text-ink-2 py-2.5 pl-[18px] pr-4 whitespace-nowrap">
                    {ratio.label}
                  </th>
                  {points.map((point) => (
                    <td key={point.period} className="text-right num text-ink-2 py-2.5 pl-4">
                      {fmtRatio(point[ratio.key], ratio.format)}
                    </td>
                  ))}
                  <td className="text-right num font-semibold text-ink py-2.5 pl-4 pr-[18px]">
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
