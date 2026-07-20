import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Transactions from './pages/Transactions'

function App() {

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path='portfolio' element={<Portfolio />} />
        <Route path='transactions' element={<Transactions />} />
      </Route>
    </Routes>
  )
}

export default App
