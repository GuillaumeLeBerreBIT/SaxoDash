# SaxoDash Frontend (Vite + React) Implementation Plan

> **For agentic workers:** This plan is executed in **propose-then-choose**
> mode, per `AGENTS.md`. For each task: show the code block below as a
> worked example, explain what it does and why (especially anything that
> differs from the original Claude Design mockup — new loading/error
> states, real routing instead of `useState` paging, real API calls
> instead of the global `data.jsx` arrays). Then ask the user whether
> they want to write the file themselves from the example or have you
> apply it directly. Don't default silently either way. Requires the
> backend plan (`2026-07-13-saxodash-backend.md`) to be running on
> `localhost:8000` first — every task from Task 3 onward hits real
> endpoints.

**Goal:** A Vite + React app with a login screen and three working pages
(Dashboard, Portfolio, Transactions) consuming the DRF API from the
backend plan, visually matching the original SaxoDash mockup.

**Architecture:** Single-page app, React Router for real URLs, one
`useEffect` fetch per page (no global state library), token auth stored
in `localStorage`, mockup's own hand-rolled Tailwind components ported
as-is (no UI kit).

**Tech Stack:** Vite, React 18, react-router-dom, Recharts, lucide-react,
Tailwind CSS v4 (`@tailwindcss/vite` plugin).

## Global Constraints

- No TypeScript this milestone — plain `.jsx`.
- No automated frontend tests this milestone (per the design spec) —
  each task's "test" step is a manual verification in the browser instead.
- All API calls go through `frontend/src/api/client.js` — no `fetch()`
  calls scattered directly in page components.
- Auth token lives in `localStorage` under the key `saxodash_token`; any
  `401` response triggers a redirect to `/login`.
- Only Dashboard, Portfolio, Transactions appear in the sidebar nav —
  Research/Earnings/Banking are future milestones and should not be
  listed as dead links.

---

## File Structure

```
frontend/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx
│   ├── App.jsx                 Router + layout
│   ├── lib/format.js           fmtEUR, fmtPct, fmtNum
│   ├── api/client.js           request(), login(), getPositions(), etc.
│   ├── components/
│   │   ├── Icon.jsx
│   │   ├── ui.jsx               Card, CardHeader, StatCard, RangePills,
│   │   │                        Badge, PageHeader, LoadingState, ErrorState
│   │   ├── Sidebar.jsx
│   │   └── ProtectedRoute.jsx
│   └── pages/
│       ├── Login.jsx
│       ├── Dashboard.jsx
│       ├── Portfolio.jsx
│       └── Transactions.jsx
```

---

### Task 1: Vite project scaffold + Tailwind + dev proxy

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.js`,
  `frontend/index.html`, `frontend/src/main.jsx`, `frontend/src/App.jsx`
  (placeholder), `frontend/src/index.css`

**Interfaces:**
- Produces: `npm run dev` serves the app at `localhost:5173`, requests
  to `/api/*` are proxied to `localhost:8000` (the Django dev server),
  Tailwind classes work.

- [ ] **Step 1: Scaffold with Vite**

```bash
cd /Users/guillaumeleberre/GuillaumesLab/WebDevelopment/SaxoDash
npm create vite@latest frontend -- --template react
cd frontend
npm install
npm install react-router-dom recharts lucide-react
npm install -D @tailwindcss/vite tailwindcss
```

- [ ] **Step 2: Configure Vite — Tailwind plugin + API proxy**

```js
// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

- [ ] **Step 3: Import Tailwind and base styles**

```css
/* frontend/src/index.css */
@import "tailwindcss";

html, body { background: #09090b; color: #fafafa; }
body { margin: 0; }
.num { font-variant-numeric: tabular-nums; }
```

Make sure `frontend/src/main.jsx` imports it:

```jsx
// frontend/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

```jsx
// frontend/src/App.jsx (placeholder, replaced in Task 6)
export default function App() {
  return <div className="p-8 text-zinc-100">SaxoDash — scaffold OK</div>
}
```

- [ ] **Step 4: Manual verification**

```bash
npm run dev
```

Open `http://localhost:5173` — expect a dark page reading
"SaxoDash — scaffold OK" in white/zinc text (confirms Tailwind is wired).

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/
git commit -m "chore: scaffold Vite + React + Tailwind frontend"
```

---

### Task 2: Format helpers

**Files:**
- Create: `frontend/src/lib/format.js`

**Interfaces:**
- Produces: `fmtEUR(n, {sign, decimals}) -> string`,
  `fmtPct(n, {sign, decimals}) -> string`, `fmtNum(n, decimals) -> string`
  — ported directly from the mockup's `src/data.jsx`.

- [ ] **Step 1: Write the module**

```js
// frontend/src/lib/format.js
export const fmtEUR = (n, opts = {}) => {
  const { sign = false, decimals = 2 } = opts
  const abs = Math.abs(n).toLocaleString('de-DE', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })
  const s = n < 0 ? '-' : sign ? '+' : ''
  return `${s}€${abs}`
}

export const fmtPct = (n, opts = {}) => {
  const { sign = true, decimals = 2 } = opts
  const abs = Math.abs(n).toLocaleString('de-DE', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })
  const s = n < 0 ? '-' : sign ? '+' : ''
  return `${s}${abs}%`
}

export const fmtNum = (n, decimals = 2) =>
  n.toLocaleString('de-DE', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })
```

- [ ] **Step 2: Manual verification**

Temporarily add to `App.jsx`:
```jsx
import { fmtEUR, fmtPct } from './lib/format'
console.log(fmtEUR(84231.5), fmtPct(12.4))
```
Run `npm run dev`, open the browser console. Expect `€84.231,50` and
`+12,40%`. Remove the temporary import/console.log afterward.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/
git commit -m "feat(frontend): add EUR/percent/number format helpers"
```

---

### Task 3: API client

**Files:**
- Create: `frontend/src/api/client.js`

**Interfaces:**
- Produces: `login(username, password) -> Promise<void>` (stores token),
  `logout()`, `getPositions()`, `getPortfolioSummary()`,
  `getTransactions(params)`, `getAccounts()`, `getNetWorth()` — each
  `Promise<data>`, throwing on non-2xx with `.status` set, and on `401`
  clearing the stored token.

- [ ] **Step 1: Write the client**

```js
// frontend/src/api/client.js
const TOKEN_KEY = 'saxodash_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
}

async function request(path, options = {}) {
  const token = getToken()
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...options.headers,
    },
  })
  if (response.status === 401) {
    logout()
  }
  if (!response.ok) {
    const error = new Error(`API error: ${response.status}`)
    error.status = response.status
    throw error
  }
  return response.json()
}

export async function login(username, password) {
  const body = new URLSearchParams({ username, password })
  const response = await fetch('/api/auth/login/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    const error = new Error('Invalid credentials')
    error.status = response.status
    throw error
  }
  const data = await response.json()
  setToken(data.token)
}

export const getPositions = () => request('/portfolio/positions/')
export const getPortfolioSummary = () => request('/portfolio/summary/')
export const getAccounts = () => request('/accounts/')
export const getNetWorth = () => request('/accounts/net-worth/')

export function getTransactions(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return request(`/transactions/${qs ? `?${qs}` : ''}`)
}
```

- [ ] **Step 2: Manual verification**

With the backend running and seeded (from the backend plan), temporarily
add to `App.jsx`:
```jsx
import { useEffect } from 'react'
import { login, getPortfolioSummary } from './api/client'

useEffect(() => {
  login('alex', 'changeme123').then(getPortfolioSummary).then(console.log)
}, [])
```
Expect the console to log the summary object with `total_value`. Remove
the temporary code afterward.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/
git commit -m "feat(frontend): add API client with token auth"
```

---

### Task 4: Icon component

**Files:**
- Create: `frontend/src/components/Icon.jsx`

**Interfaces:**
- Produces: `<Icon name="LayoutDashboard" size={16} strokeWidth={1.75} />`
  — resolves `name` to a `lucide-react` component and renders it.

- [ ] **Step 1: Write the component**

```jsx
// frontend/src/components/Icon.jsx
import * as icons from 'lucide-react'

export default function Icon({ name, size = 16, strokeWidth = 2, ...props }) {
  const LucideIcon = icons[name]
  if (!LucideIcon) return null
  return <LucideIcon size={size} strokeWidth={strokeWidth} {...props} />
}
```

- [ ] **Step 2: Manual verification**

Temporarily render `<Icon name="LineChart" size={20} />` in `App.jsx`.
Expect a blue-ish line-chart icon glyph to appear. Remove afterward.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Icon.jsx
git commit -m "feat(frontend): add Icon component wrapping lucide-react"
```

---

### Task 5: Shared UI primitives

**Files:**
- Create: `frontend/src/components/ui.jsx`

**Interfaces:**
- Produces: `Card`, `CardHeader`, `StatCard`, `RangePills`, `Badge`,
  `PageHeader` (ported from the mockup's `sidebar.jsx`, unchanged in
  behavior), plus two new ones the mockup never needed:
  `LoadingState` and `ErrorState`.

- [ ] **Step 1: Write the module**

```jsx
// frontend/src/components/ui.jsx
export function Card({ children, className = '', padding = true }) {
  return (
    <div className={`bg-gradient-to-b from-zinc-900 to-zinc-900/70 border border-white/[0.06] border-t-white/[0.09] rounded-xl shadow-sm shadow-black/40 ${padding ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, right, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div>
        <h3 className="text-[13px] font-medium text-zinc-200">{title}</h3>
        {subtitle && <p className="text-[12px] text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function StatCard({ label, value, badge, badgeTone = 'blue', note }) {
  const tones = {
    blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/15',
    emerald: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15',
    red: 'bg-red-500/10 text-red-400 border border-red-500/15',
    zinc: 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/70',
  }
  return (
    <Card>
      <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-2.5 text-[clamp(20px,1.9vw,28px)] font-semibold text-zinc-50 tracking-tight num font-mono whitespace-nowrap">
        {value}
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {badge && (
          <span className={`inline-flex items-center text-[11.5px] px-2 py-0.5 rounded-md font-medium num font-mono ${tones[badgeTone] || tones.zinc}`}>
            {badge}
          </span>
        )}
        {note && <span className="text-[12px] text-zinc-500">{note}</span>}
      </div>
    </Card>
  )
}

export function RangePills({ value, onChange, options = ['1W', '1M', '3M', '6M', '1Y', 'ALL'] }) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-zinc-950/60 border border-white/[0.06]">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`px-2.5 h-6 text-[11px] font-medium rounded ${
            value === o ? 'bg-zinc-800 text-zinc-50 shadow-sm ring-1 ring-white/10' : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

export function Badge({ tone = 'zinc', children, className = '' }) {
  const tones = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/15',
    zinc: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/70',
    red: 'bg-red-500/10 text-red-400 border-red-500/15',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',
  }
  return (
    <span className={`inline-flex items-center text-[10.5px] font-medium tracking-wide uppercase px-1.5 py-0.5 rounded border ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function PageHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-zinc-50">{title}</h1>
        {subtitle && <p className="text-[13px] text-zinc-500 mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

// New — the mockup read from a synchronous global array and never needed these.
export function LoadingState({ label = 'Loading…' }) {
  return <div className="text-[13px] text-zinc-500 py-8 text-center">{label}</div>
}

export function ErrorState({ message = 'Something went wrong.' }) {
  return (
    <Card className="border-red-500/20">
      <div className="text-[13px] text-red-400">{message}</div>
    </Card>
  )
}
```

- [ ] **Step 2: Manual verification**

Temporarily render `<StatCard label="Net Worth" value="€122.306,50" badge="+2,4%" badgeTone="emerald" />`
in `App.jsx`. Expect a dark card with the label, large value, and a
green badge. Remove afterward.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui.jsx
git commit -m "feat(frontend): port shared UI primitives from mockup, add loading/error states"
```

---

### Task 6: Sidebar, routing, and login page

**Files:**
- Create: `frontend/src/components/Sidebar.jsx`
- Create: `frontend/src/components/ProtectedRoute.jsx`
- Create: `frontend/src/pages/Login.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Produces: real routes `/login`, `/`, `/portfolio`, `/transactions`.
  `/`, `/portfolio`, `/transactions` require a token (redirect to
  `/login` otherwise) — this replaces the mockup's `useState`
  page-switching with actual URLs.

- [ ] **Step 1: Sidebar (nav limited to this milestone's 3 pages)**

```jsx
// frontend/src/components/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import Icon from './Icon'

const items = [
  { to: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { to: '/portfolio', label: 'Portfolio', icon: 'Briefcase' },
  { to: '/transactions', label: 'Transactions', icon: 'List' },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] border-r border-white/[0.06] bg-gradient-to-b from-zinc-950 to-[#0b0b0e] flex flex-col z-30">
      <div className="h-14 flex items-center px-4 border-b border-white/[0.06]">
        <div className="w-7 h-7 rounded-md bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
          <Icon name="LineChart" size={15} strokeWidth={2} />
        </div>
        <span className="ml-2.5 text-[15px] font-medium tracking-tight text-zinc-50">SaxoDash</span>
      </div>
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/'}
            className={({ isActive }) =>
              `relative w-full h-9 flex items-center px-3 gap-3 rounded-md text-[13px] ${
                isActive ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`
            }
          >
            <Icon name={it.icon} size={16} strokeWidth={1.75} />
            <span className="font-medium">{it.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: Protected route wrapper**

```jsx
// frontend/src/components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom'
import { getToken } from '../api/client'

export default function ProtectedRoute({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return children
}
```

- [ ] **Step 3: Login page**

```jsx
// frontend/src/pages/Login.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api/client'
import { Card } from '../components/ui'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    try {
      await login(username, password)
      navigate('/')
    } catch {
      setError('Invalid username or password.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <Card className="w-[320px]">
        <h1 className="text-[18px] font-medium text-zinc-50 mb-4">Sign in to SaxoDash</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="w-full bg-zinc-900 border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-zinc-100"
            placeholder="Username" value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            className="w-full bg-zinc-900 border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-zinc-100"
            placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div className="text-[12px] text-red-400">{error}</div>}
          <button className="w-full bg-blue-500/15 border border-blue-500/30 text-blue-400 rounded-md h-9 text-[13px] font-medium">
            Sign in
          </button>
        </form>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: App.jsx — real router**

```jsx
// frontend/src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Transactions from './pages/Transactions'

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Sidebar />
      <main style={{ marginLeft: 220 }}>
        <div className="px-8 py-8 max-w-[1500px] mx-auto">{children}</div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path="/portfolio" element={<ProtectedRoute><Layout><Portfolio /></Layout></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute><Layout><Transactions /></Layout></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
```

Note: `Dashboard`, `Portfolio`, `Transactions` don't exist yet — Tasks
7–9 create them. This task will not compile until those land; that's
expected, commit anyway since it's the natural checkpoint for the
routing shape itself, and the next three tasks are small.

- [ ] **Step 5: Manual verification (after stubbing the three pages)**

Add temporary one-line stub pages if needed
(`export default () => <div>Dashboard</div>` etc.) just to verify
routing, then delete the stubs once Tasks 7–9 provide the real ones.
With the backend running: visit `http://localhost:5173/`, confirm
redirect to `/login`; log in with `alex` / `changeme123`; confirm
redirect to `/` and the sidebar renders with 3 links, each navigating
without a full page reload.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/components/ProtectedRoute.jsx frontend/src/pages/Login.jsx frontend/src/App.jsx
git commit -m "feat(frontend): add sidebar, protected routing, and login page"
```

---

### Task 7: Dashboard page

**Files:**
- Create: `frontend/src/pages/Dashboard.jsx`

**Interfaces:**
- Consumes: `getNetWorth()`, `getPortfolioSummary()`,
  `getTransactions({ page_size: 5 })` from `api/client.js` (Task 3);
  `Card`, `StatCard`, `PageHeader`, `LoadingState`, `ErrorState` from
  `components/ui.jsx` (Task 5).
- Produces: `Dashboard` page component, default export.

- [ ] **Step 1: Write the page**

```jsx
// frontend/src/pages/Dashboard.jsx
import { useEffect, useState } from 'react'
import { getNetWorth, getPortfolioSummary, getTransactions } from '../api/client'
import { Card, CardHeader, StatCard, PageHeader, LoadingState, ErrorState } from '../components/ui'
import { fmtEUR, fmtPct } from '../lib/format'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      getNetWorth(),
      getPortfolioSummary(),
      getTransactions({ page_size: 5 }),
    ])
      .then(([netWorth, summary, tx]) => setData({ netWorth, summary, recentTx: tx.results }))
      .catch(setError)
  }, [])

  if (error) return <ErrorState message="Could not load dashboard data." />
  if (!data) return <LoadingState label="Loading dashboard…" />

  const { netWorth, summary, recentTx } = data

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Overview of your net worth and portfolio" />
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Net Worth" value={fmtEUR(netWorth.net_worth)} />
        <StatCard
          label="Portfolio Value" value={fmtEUR(summary.total_value)}
          badge={fmtPct(summary.total_pnl_pct)}
          badgeTone={summary.total_pnl_pct >= 0 ? 'emerald' : 'red'}
        />
        <StatCard label="Uninvested Cash" value={fmtEUR(netWorth.uninvested_cash)} />
      </div>
      <Card>
        <CardHeader title="Recent Transactions" />
        <div className="mt-3 space-y-2">
          {recentTx.map((tx) => (
            <div key={tx.id} className="flex justify-between text-[13px] text-zinc-300 py-1.5 border-b border-white/[0.04] last:border-0">
              <span>{tx.date} · {tx.type} · {tx.ticker}</span>
              <span className="num font-mono">{fmtEUR(tx.total)}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
```

- [ ] **Step 2: Manual verification**

With backend running + seeded, log in, land on `/`. Expect three stat
cards (Net Worth, Portfolio Value with a green/red badge, Uninvested
Cash) and a "Recent Transactions" card listing 5 rows, newest first.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat(frontend): add Dashboard page"
```

---

### Task 8: Portfolio page

**Files:**
- Create: `frontend/src/pages/Portfolio.jsx`

**Interfaces:**
- Consumes: `getPositions()`, `getPortfolioSummary()` from
  `api/client.js`; `Card`, `Badge`, `PageHeader`, `LoadingState`,
  `ErrorState` from `components/ui.jsx`.
- Produces: `Portfolio` page component, default export.

- [ ] **Step 1: Write the page**

```jsx
// frontend/src/pages/Portfolio.jsx
import { useEffect, useState } from 'react'
import { getPositions, getPortfolioSummary } from '../api/client'
import { Card, Badge, PageHeader, LoadingState, ErrorState } from '../components/ui'
import { fmtEUR, fmtPct, fmtNum } from '../lib/format'

export default function Portfolio() {
  const [positions, setPositions] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getPositions(), getPortfolioSummary()])
      .then(([pos, sum]) => { setPositions(pos); setSummary(sum) })
      .catch(setError)
  }, [])

  if (error) return <ErrorState message="Could not load portfolio." />
  if (!positions || !summary) return <LoadingState label="Loading portfolio…" />

  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle={`${positions.length} positions · ${fmtEUR(summary.total_value)}`}
      />
      <Card padding={false}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] text-zinc-500 uppercase tracking-wider border-b border-white/[0.06]">
              <th className="py-3 px-4">Ticker</th>
              <th className="py-3 px-4">Qty</th>
              <th className="py-3 px-4">Avg Cost</th>
              <th className="py-3 px-4">Price</th>
              <th className="py-3 px-4">Value</th>
              <th className="py-3 px-4">P&L</th>
              <th className="py-3 px-4">Weight</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id} className="border-b border-white/[0.04] last:border-0">
                <td className="py-3 px-4">
                  <div className="text-zinc-100 font-medium">{p.ticker}</div>
                  <div className="text-zinc-500 text-[11px]">{p.name}</div>
                </td>
                <td className="py-3 px-4 num font-mono">{p.qty}</td>
                <td className="py-3 px-4 num font-mono">{fmtEUR(p.avg_cost)}</td>
                <td className="py-3 px-4 num font-mono">{fmtEUR(p.current_price)}</td>
                <td className="py-3 px-4 num font-mono">{fmtEUR(p.value)}</td>
                <td className="py-3 px-4">
                  <Badge tone={p.pnl >= 0 ? 'emerald' : 'red'}>{fmtPct(p.pnl_pct)}</Badge>
                </td>
                <td className="py-3 px-4 num font-mono">{fmtNum(p.weight, 1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}
```

- [ ] **Step 2: Manual verification**

Navigate to `/portfolio`. Expect a table of 6 positions (NVDA, AAPL,
AMZN, GOOGL, META, XNAS), each row showing qty/avg cost/price/value, a
green or red P&L badge, and a weight percentage that sums to
approximately 100% across all rows.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Portfolio.jsx
git commit -m "feat(frontend): add Portfolio page"
```

---

### Task 9: Transactions page

**Files:**
- Create: `frontend/src/pages/Transactions.jsx`

**Interfaces:**
- Consumes: `getTransactions(params)` from `api/client.js`; `Card`,
  `PageHeader`, `LoadingState`, `ErrorState` from `components/ui.jsx`.
- Produces: `Transactions` page component, default export, with a type
  filter (BUY/SELL/DIVIDEND/DEPOSIT/FEE/All) and Prev/Next pagination.

- [ ] **Step 1: Write the page**

```jsx
// frontend/src/pages/Transactions.jsx
import { useEffect, useState } from 'react'
import { getTransactions } from '../api/client'
import { Card, PageHeader, LoadingState, ErrorState } from '../components/ui'
import { fmtEUR } from '../lib/format'

const TYPES = ['All', 'BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'FEE']

export default function Transactions() {
  const [type, setType] = useState('All')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setData(null)
    const params = { page }
    if (type !== 'All') params.type = type
    getTransactions(params).then(setData).catch(setError)
  }, [type, page])

  return (
    <>
      <PageHeader title="Transactions" subtitle="Full buy/sell/dividend/deposit history" />
      <div className="flex gap-2 mb-4">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => { setType(t); setPage(1) }}
            className={`px-2.5 h-7 text-[12px] rounded-md border ${
              type === t ? 'bg-zinc-800 text-zinc-50 border-white/10' : 'text-zinc-400 border-transparent hover:text-zinc-100'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {error && <ErrorState message="Could not load transactions." />}
      {!error && !data && <LoadingState label="Loading transactions…" />}
      {data && (
        <Card padding={false}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-zinc-500 uppercase tracking-wider border-b border-white/[0.06]">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Instrument</th>
                <th className="py-3 px-4">Qty</th>
                <th className="py-3 px-4">Price</th>
                <th className="py-3 px-4">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((tx) => (
                <tr key={tx.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="py-3 px-4 text-zinc-400">{tx.date}</td>
                  <td className="py-3 px-4">{tx.type}</td>
                  <td className="py-3 px-4">{tx.instrument}</td>
                  <td className="py-3 px-4 num font-mono">{tx.qty}</td>
                  <td className="py-3 px-4 num font-mono">{fmtEUR(tx.price)}</td>
                  <td className="py-3 px-4 num font-mono">{fmtEUR(tx.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-2 p-4">
            <button
              disabled={!data.previous} onClick={() => setPage((p) => p - 1)}
              className="px-3 h-7 text-[12px] rounded-md border border-white/10 text-zinc-300 disabled:opacity-30"
            >
              Prev
            </button>
            <button
              disabled={!data.next} onClick={() => setPage((p) => p + 1)}
              className="px-3 h-7 text-[12px] rounded-md border border-white/10 text-zinc-300 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </Card>
      )}
    </>
  )
}
```

- [ ] **Step 2: Manual verification**

Navigate to `/transactions`. Expect all 12 seeded transactions across
one page (page size 20 > 12 rows, so Prev/Next stay disabled).
Click "DIVIDEND" — expect the list to filter to just the 2 seeded
dividend rows. Click "All" to reset.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Transactions.jsx
git commit -m "feat(frontend): add Transactions page with type filter and pagination"
```

---

## Definition of done

- `npm run dev` + backend running: `/login` → sign in → redirected to
  `/`, sidebar shows 3 links, each navigates without a full reload.
- Dashboard shows net worth, portfolio value with P&L badge, uninvested
  cash, and 5 recent transactions.
- Portfolio shows all 6 seeded positions with correct value/P&L/weight.
- Transactions shows all 12 seeded rows, filterable by type, with
  working Prev/Next.
- Visiting any protected route while logged out redirects to `/login`.
