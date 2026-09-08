import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { Card, CardHeader } from '../ui'

/** Actual vs. estimate bars over recent quarters. Shared by the EPS and
 *  revenue history cards on the Earnings tab. `format` renders both the Y
 *  axis ticks and the tooltip values. */
export default function EpsBarChart({ title, subtitle, data, format }) {
  if (!data?.length) return null

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="period" />
            <YAxis {...axisProps} width={52} tickFormatter={format} />
            <Tooltip {...chartTooltipProps} formatter={format} />
            <Bar dataKey="estimate" name="Estimate" fill="#52525b" radius={[3, 3, 0, 0]} barSize={18} />
            <Bar dataKey="actual" name="Actual" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
