import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Analytics from './pages/Analytics'
import Transactions from './pages/Transactions'
import Accounts from './pages/Accounts'
import Research from './pages/Research'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

function App() {

  return (
    <Routes>
      <Route path='login' element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path='portfolio' element={<Portfolio />} />
          <Route path='analytics' element={<Analytics />} />
          <Route path='transactions' element={<Transactions />} />
          <Route path='accounts' element={<Accounts />} />
          <Route path='research' element={<Research />} />
        </Route>
      </Route>
      <Route path='*' element={<NotFound />} />
    </Routes>
  )
}

export default App
