import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Analytics from './pages/Analytics'
import Transactions from './pages/Transactions'
import Accounts from './pages/Accounts'
import AccountTransactions from './pages/AccountTransactions'
import Spending from './pages/Spending'
import Research from './pages/Research'
import ResearchChart from './pages/ResearchChart'
import Discover from './pages/Discover'
import DiscoverShelf from './pages/DiscoverShelf'
import Earnings from './pages/Earnings'
import Investors from './pages/Investors'
import Investor from './pages/Investor'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

function App() {

  return (
    <Routes>
      <Route path='login' element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route path='research/chart' element={<ResearchChart />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path='portfolio' element={<Portfolio />} />
          <Route path='analytics' element={<Analytics />} />
          <Route path='transactions' element={<Transactions />} />
          <Route path='accounts' element={<Accounts />} />
          <Route path='accounts/:accountId' element={<AccountTransactions />} />
          <Route path='spending' element={<Spending />} />
          <Route path='research' element={<Research />} />
          <Route path='discover' element={<Discover />} />
          <Route path='discover/:key' element={<DiscoverShelf />} />
          <Route path='earnings' element={<Earnings />} />
          <Route path='investors' element={<Investors />} />
          <Route path='investors/:slug' element={<Investor />} />
        </Route>
      </Route>
      <Route path='*' element={<NotFound />} />
    </Routes>
  )
}

export default App
