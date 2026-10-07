import { Input, Select, TBtn } from '../ui'
import { INVESTOR_GROUPS, INVESTOR_SORTS } from '../../lib/investors'

export default function InvestorToolbar({ group, onGroup, query, onQuery, sort, onSort, layout, onLayout }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div role="group" aria-label="Show investors" className="flex items-center gap-0.5">
        {INVESTOR_GROUPS.map(([key, label]) => (
          <TBtn key={key} active={group === key} onClick={() => onGroup(key)}>{label}</TBtn>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="search"
          aria-label="Search investors"
          placeholder="Investor, firm or ticker"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="w-56"
        />
        <Select aria-label="Sort investors" value={sort} onChange={(e) => onSort(e.target.value)}>
          {INVESTOR_SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </Select>
        <div role="group" aria-label="Investor layout" className="flex items-center gap-0.5">
          <TBtn active={layout === 'cards'} onClick={() => onLayout('cards')}>Cards</TBtn>
          <TBtn active={layout === 'table'} onClick={() => onLayout('table')}>Table</TBtn>
        </div>
      </div>
    </div>
  )
}
