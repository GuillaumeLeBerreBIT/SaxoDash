import { useSearchParams } from 'react-router-dom'
import { TabButton, TabList } from '../components/ui'
import OverviewSection from '../components/money/OverviewSection'
import AccountsSection from '../components/money/AccountsSection'
import SpendingSection from '../components/money/SpendingSection'
import BudgetsSection from '../components/money/BudgetsSection'
import TransactionsSection from '../components/money/TransactionsSection'

const SECTIONS = [
  { key: 'overview', label: 'Overview', Section: OverviewSection },
  { key: 'accounts', label: 'Accounts', Section: AccountsSection },
  { key: 'spending', label: 'Spending', Section: SpendingSection },
  { key: 'budgets', label: 'Budgets', Section: BudgetsSection },
  { key: 'transactions', label: 'Transactions', Section: TransactionsSection },
]

export default function Money() {
  const [params, setParams] = useSearchParams()
  const active = SECTIONS.find((section) => section.key === params.get('section')) ?? SECTIONS[0]
  const choose = (key) => setParams(key === 'overview' ? {} : { section: key })
  const { Section } = active

  return (
    <div className="flex flex-col gap-[var(--sd-gap,12px)]">
      <TabList label="Money sections" className="overflow-x-auto">
        {SECTIONS.map(({ key, label }) => (
          <TabButton
            key={key}
            id={`money-tab-${key}`}
            controls="money-section"
            active={key === active.key}
            onClick={() => choose(key)}
          >
            {label}
          </TabButton>
        ))}
      </TabList>
      <div id="money-section" role="tabpanel" aria-labelledby={`money-tab-${active.key}`} className="min-w-0">
        <Section />
      </div>
    </div>
  )
}
