import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import ResearchTabs from './ResearchTabs'

const groups = [
  ['overview', 'Overview', ['overview']],
  ['fundamentals', 'Fundamentals', ['financials', 'statistics']],
]

function renderTabs(activeGroup, subTabs) {
  return render(
    <ResearchTabs
      groups={groups}
      activeGroup={activeGroup}
      onSelectGroup={vi.fn()}
      subTabs={subTabs}
      activeTab={subTabs[0]?.[0] ?? 'overview'}
      onSelectTab={vi.fn()}
    />,
  )
}

describe('ResearchTabs', () => {
  it('shows no second row for a group with a single section', () => {
    renderTabs('overview', [['overview', 'Overview']])

    expect(screen.getAllByRole('tablist')).toHaveLength(1)
  })

  it('puts a group\'s sections on the same row as the groups, so opening it moves nothing', () => {
    renderTabs('fundamentals', [['financials', 'Financials'], ['statistics', 'Statistics']])

    const groupList = screen.getByRole('tablist', { name: 'Instrument sections' })
    const sectionList = screen.getByRole('tablist', { name: 'Fundamentals sections' })
    expect(sectionList.parentElement).toBe(groupList.parentElement)
  })
})
