import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Analytics from './pages/Analytics'
import AccountTransactions from './pages/AccountTransactions'
import Research from './pages/Research'
import ResearchChart from './pages/ResearchChart'
import Discover from './pages/Discover'
import DiscoverShelf from './pages/DiscoverShelf'
import Earnings from './pages/Earnings'
import Investors from './pages/Investors'
import Investor from './pages/Investor'
import InvestorStocks from './pages/InvestorStocks'
import CongressMember from './pages/CongressMember'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import LegacyRedirect from './routes/LegacyRedirect'
import { MoneyRoute } from './routes/placeholders'
import Settings from './pages/Settings'
import { LEGACY_REDIRECTS } from './lib/navigation'

function App() {
  return (
    <Routes>
      <Route path='login' element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path='portfolio' element={<Portfolio />} />
          <Route path='analytics' element={<Analytics />} />
          <Route path='money' element={<MoneyRoute />} />
          <Route path='money/accounts/:accountId' element={<AccountTransactions />} />
          <Route path='settings' element={<Settings />} />
          <Route path='research' element={<Research />} />
          <Route path='boards' element={<ResearchChart />} />
          <Route path='boards/:id' element={<ResearchChart />} />
          <Route path='discover' element={<Discover />} />
          <Route path='discover/:key' element={<DiscoverShelf />} />
          <Route path='earnings' element={<Earnings />} />
          <Route path='investors' element={<Investors />} />
          <Route path='investors/stocks' element={<InvestorStocks />} />
          <Route path='investors/congress/:slug' element={<CongressMember />} />
          <Route path='investors/:slug' element={<Investor />} />
          {LEGACY_REDIRECTS.map((redirect) => (
            <Route key={redirect.from} path={redirect.from} element={<LegacyRedirect redirect={redirect} />} />
          ))}
        </Route>
      </Route>
      <Route path='*' element={<NotFound />} />
    </Routes>
  )
}

export default App
