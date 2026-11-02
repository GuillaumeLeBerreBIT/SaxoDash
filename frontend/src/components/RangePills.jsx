/* eslint-disable react-refresh/only-export-components */
import { Segmented } from './ui'

export const RANGES = ['1M', '3M', '6M', '1Y', 'ALL']

const RANGE_OPTIONS = RANGES.map((range) => ({ value: range, label: range }))

export function RangePills({ value, onChange }) {
  return <Segmented label="Range" options={RANGE_OPTIONS} value={value} onChange={onChange} />
}
