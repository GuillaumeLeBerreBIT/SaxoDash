import { useSearchParams } from 'react-router-dom'
import Accounts from '../pages/Accounts'
import Spending from '../pages/Spending'
import SpendingTransactions from '../pages/SpendingTransactions'

const MONEY_SECTIONS = {
  accounts: Accounts,
  transactions: SpendingTransactions,
}

export function MoneyRoute() {
  const [params] = useSearchParams()
  const Section = MONEY_SECTIONS[params.get('section')] ?? Spending
  return <Section />
}
