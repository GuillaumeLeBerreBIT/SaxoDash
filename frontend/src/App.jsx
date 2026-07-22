import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Transactions from './pages/Transactions'
import Login from './pages/Login'

function App() {

  return (
    <Routes>
      <Route path='login' element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path='portfolio' element={<Portfolio />} />
        <Route path='transactions' element={<Transactions />} />
      </Route>
    </Routes>
  )
}

export default App
