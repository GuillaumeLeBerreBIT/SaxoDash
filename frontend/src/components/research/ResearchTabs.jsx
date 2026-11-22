import { TabButton, TabList } from '../ui'

const STRIP = 'shrink-0 border-b-0'
const TAB = 'shrink-0 px-3! first:pl-0! md:h-8!'

export default function ResearchTabs({ groups, activeGroup, onSelectGroup, subTabs, activeTab, onSelectTab }) {
  const groupLabel = groups.find(([key]) => key === activeGroup)?.[1] ?? ''

  return (
    <div className="flex items-center gap-x-6 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
      <TabList label="Instrument sections" className={`pb-px ${STRIP}`}>
        {groups.map(([key, label]) => (
          <TabButton key={key} id={`research-group-${key}`} active={activeGroup === key} onClick={() => onSelectGroup(key)} className={TAB}>
            {label}
          </TabButton>
        ))}
      </TabList>

      {subTabs.length > 1 ? (
        <TabList label={`${groupLabel} sections`} className={`pb-px ml-auto ${STRIP}`}>
          {subTabs.map(([key, label]) => (
            <TabButton
              key={key}
              id={`research-tab-${key}`}
              controls={`research-panel-${key}`}
              active={activeTab === key}
              onClick={() => onSelectTab(key)}
              className={TAB}
            >
              {label}
            </TabButton>
          ))}
        </TabList>
      ) : null}
    </div>
  )
}
