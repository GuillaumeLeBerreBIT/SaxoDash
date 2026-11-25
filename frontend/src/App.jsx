import { lazy, Suspense } from 'react'
import { Navigate, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import LegacyRedirect from './routes/LegacyRedirect'
import { LEGACY_REDIRECTS, RETIRED_PATHS } from './lib/navigation'
import PageFallback from './components/PageFallback'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Research = lazy(() => import('./pages/Research'))
const Charts = lazy(() => import('./pages/Charts'))
const Boards = lazy(() => import('./pages/Boards'))
const Discover = lazy(() => import('./pages/Discover'))
const DiscoverShelf = lazy(() => import('./pages/DiscoverShelf'))
const Earnings = lazy(() => import('./pages/Earnings'))
const Investors = lazy(() => import('./pages/Investors'))
const Investor = lazy(() => import('./pages/Investor'))
const InvestorStocks = lazy(() => import('./pages/InvestorStocks'))
const CongressMember = lazy(() => import('./pages/CongressMember'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Settings = lazy(() => import('./pages/Settings'))

function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path='login' element={<Login />} />
        <Route path='signup' element={<Signup />} />
        <Route path='forgot-password' element={<ForgotPassword />} />
        <Route path='reset-password' element={<ResetPassword />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path='portfolio' element={<Portfolio />} />
            <Route path='analytics' element={<Analytics />} />
            <Route path='settings' element={<Settings />} />
            <Route path='research' element={<Research />} />
            <Route path='charts' element={<Charts />} />
            <Route path='boards' element={<Boards />} />
            <Route path='boards/:id' element={<Boards />} />
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
            {RETIRED_PATHS.map((path) => (
              <Route key={path} path={path} element={<Navigate to='/' replace />} />
            ))}
            <Route path='*' element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
