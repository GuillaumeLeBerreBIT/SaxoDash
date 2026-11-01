import { useSearchParams } from 'react-router-dom'
import Portfolio from '../pages/Portfolio'
import Transactions from '../pages/Transactions'
import Accounts from '../pages/Accounts'
import Spending from '../pages/Spending'
import SpendingTransactions from '../pages/SpendingTransactions'

export function PortfolioRoute() {
  const [params] = useSearchParams()
  return params.get('view') === 'transactions' ? <Transactions /> : <Portfolio />
}

const MONEY_SECTIONS = {
  accounts: Accounts,
  transactions: SpendingTransactions,
}

export function MoneyRoute() {
  const [params] = useSearchParams()
  const Section = MONEY_SECTIONS[params.get('section')] ?? Spending
  return <Section />
}
