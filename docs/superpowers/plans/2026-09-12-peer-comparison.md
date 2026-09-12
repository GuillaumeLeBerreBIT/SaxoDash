# Peer Comparison (Slice 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Peers" tab to the Research page showing a comparison table of the current symbol against up to 5 peers, with any peer swappable for a manually chosen symbol.

**Architecture:** Backend adds a thin, symbol-only peers lookup (`GET /api/research/peers/<symbol>/`), reusing Finnhub's `/stock/peers`. The frontend resolves which symbols to show (auto peers + manual overrides) via a pure helper, then fetches metrics for every resolved symbol through the existing per-symbol `fundamentals` fetch — the same code path a symbol gets on its own Research page.

**Tech Stack:** Django REST Framework (backend), React + TanStack Query (frontend), existing Finnhub integration in `backend/research/finnhub.py`.

**Spec:** `docs/superpowers/specs/2026-09-12-peer-comparison-design.md`

## Global Constraints

- Peers endpoint returns symbols only — no embedded metrics (spec: "Backend").
- Comparison table shows exactly these rows: 1Y return, market cap, P/E, PEG, revenue growth (TTM YoY), EPS growth (TTM YoY), net margin, ROE, analyst recommendation (spec: "Comparison metrics").
- Max 5 peer slots (spec: "Backend", `MAX_PEERS`/`MAX_PEER_SLOTS`).
- Manual swaps are session-local component state only — no persistence, no new model (spec: "Out of scope").
- No market-wide screener/discovery in this slice (spec: "Problem").

---

### Task 1: Finnhub peers client + shaping

**Files:**
- Modify: `backend/research/finnhub.py`
- Test: `backend/research/tests.py`

**Interfaces:**
- Produces: `finnhub.get_peers(symbol: str) -> list[str]`, `finnhub.peers(symbol: str) -> {"available": True, "symbols": list[str]}`, `finnhub.MAX_PEERS = 5`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/research/tests.py`, near `FinnhubClientTest` (the client test) and near `FundamentalsCacheTest` (the shaping test):

```python
class PeersClientTest(TestCase):
    @override_settings(FINNHUB_API_KEY='test-key')
    @patch('research.finnhub.requests.get')
    def test_get_peers_calls_the_peers_endpoint(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: ['AAPL', 'MSFT'])

        result = finnhub.get_peers('AAPL')

        self.assertEqual(result, ['AAPL', 'MSFT'])
        self.assertEqual(mock_get.call_args.args[0], 'https://finnhub.io/api/v1/stock/peers')
        self.assertEqual(mock_get.call_args.kwargs['params']['symbol'], 'AAPL')


@override_settings(CACHES=LOCMEM)
class PeersShapingTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_peers')
    def test_drops_the_query_symbol_and_caps_at_five(self, mock_get_peers):
        mock_get_peers.return_value = ['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'NFLX']

        result = finnhub.peers('AAPL')

        self.assertTrue(result['available'])
        self.assertEqual(result['symbols'], ['MSFT', 'GOOGL', 'META', 'AMZN', 'NFLX'])

    @patch('research.finnhub.get_peers')
    def test_a_second_call_for_the_same_symbol_does_not_refetch(self, mock_get_peers):
        mock_get_peers.return_value = ['AAPL', 'MSFT']

        finnhub.peers('AAPL')
        finnhub.peers('AAPL')

        self.assertEqual(mock_get_peers.call_count, 1)

    @patch('research.finnhub.get_peers')
    def test_an_empty_peer_list_is_available_with_no_symbols(self, mock_get_peers):
        mock_get_peers.return_value = []

        result = finnhub.peers('ZZZZZZ')

        self.assertTrue(result['available'])
        self.assertEqual(result['symbols'], [])

    @patch('research.finnhub.get_peers')
    def test_a_provider_error_propagates(self, mock_get_peers):
        mock_get_peers.side_effect = finnhub.FinnhubAPIError('boom')

        with self.assertRaises(finnhub.FinnhubAPIError):
            finnhub.peers('AAPL')
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python manage.py test research.tests.PeersClientTest research.tests.PeersShapingTest -v 2`
Expected: FAIL — `AttributeError: module 'research.finnhub' has no attribute 'get_peers'`.

- [ ] **Step 3: Implement**

In `backend/research/finnhub.py`, add the client call after `get_company_news` (around line 109):

```python
def get_peers(symbol):
    return _get('/stock/peers', symbol=symbol)
```

Add constants next to `FUNDAMENTALS_TTL` (around line 112):

```python
PEERS_TTL = 86400  # peer sets rarely change; same cadence as fundamentals
MAX_PEERS = 5
```

Add the shaping function after `fundamentals()` (around line 327):

```python
def _peers_cache_key(symbol):
    return f'research:peers:v1:{symbol}'


def peers(symbol):
    def produce():
        raw = get_peers(symbol) or []
        symbols = [s for s in raw if s and s.upper() != symbol][:MAX_PEERS]
        return {'symbols': symbols}

    data = cache.get_or_set(_peers_cache_key(symbol), produce, PEERS_TTL)
    return {'available': True, **data}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python manage.py test research.tests.PeersClientTest research.tests.PeersShapingTest -v 2`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/research/finnhub.py backend/research/tests.py
git commit -m "feat: add Finnhub peers lookup (Slice 5, Task 1)"
```

---

### Task 2: Peers API endpoint

**Files:**
- Modify: `backend/research/views.py`
- Modify: `backend/research/urls.py`
- Modify: `backend/backend/settings.py`
- Test: `backend/research/tests.py`

**Interfaces:**
- Consumes: `finnhub.peers(symbol)` from Task 1.
- Produces: `GET /api/research/peers/<symbol>/` → `{"available": true, "symbols": [...]}`, `research.views.PeersView`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/research/tests.py`, near `FundamentalsViewTest`:

```python
@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class PeersViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.get('/api/research/peers/AAPL/')
        self.assertEqual(response.status_code, 401)

    @patch('research.finnhub.get_peers')
    def test_returns_available_true_with_symbols(self, mock_get_peers):
        mock_get_peers.return_value = ['AAPL', 'MSFT', 'GOOGL']

        response = self.client.get('/api/research/peers/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['available'])
        self.assertEqual(response.data['symbols'], ['MSFT', 'GOOGL'])

    @override_settings(FINNHUB_API_KEY='')
    def test_returns_available_false_when_not_configured(self):
        response = self.client.get('/api/research/peers/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])
        self.assertIn('reason', response.data)

    @patch('research.finnhub.get_peers')
    def test_returns_available_false_on_a_finnhub_error(self, mock_get_peers):
        mock_get_peers.side_effect = finnhub.FinnhubAPIError('boom')

        response = self.client.get('/api/research/peers/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])

    def test_rejects_a_malformed_symbol(self):
        response = self.client.get('/api/research/peers/AAPL%20US/')
        self.assertEqual(response.status_code, 400)
```

Also extend `ThrottleScopeConfigTest.test_every_proxy_view_scope_has_a_configured_rate`'s view tuple to include `research_views.PeersView`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python manage.py test research.tests.PeersViewTest -v 2`
Expected: FAIL — 404 (no route yet) / `ImportError` once the view is referenced in the test's import.

- [ ] **Step 3: Implement**

In `backend/research/views.py`, add right after `FundamentalsView`:

```python
class PeersView(APIView):
    throttle_scope = 'research.peers'

    def get(self, request, symbol):
        symbol = _symbol(symbol)
        return provider_response(lambda: finnhub.peers(symbol))
```

In `backend/research/urls.py`, add `PeersView` to the import list and add a path right after the `fundamentals/` path:

```python
    path('peers/<str:symbol>/', PeersView.as_view(), name='research-peers'),
```

In `backend/backend/settings.py`, add to `DEFAULT_THROTTLE_RATES` next to `'research.fundamentals'`:

```python
        'research.peers': '30/min',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python manage.py test research.tests.PeersViewTest research.tests.ThrottleScopeConfigTest -v 2`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && python manage.py test`
Expected: All tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add backend/research/views.py backend/research/urls.py backend/backend/settings.py backend/research/tests.py
git commit -m "feat: expose GET /api/research/peers/<symbol>/ (Slice 5, Task 2)"
```

---

### Task 3: Frontend — resolve which symbols to show

**Files:**
- Modify: `frontend/src/lib/research.js`
- Test: `frontend/src/lib/research.test.js`

**Interfaces:**
- Produces: `MAX_PEER_SLOTS = 5`, `resolvePeerSlots(currentSymbol: string, autoSymbols: string[], overrides: (string|null|undefined)[]) -> {slot: number, symbol: string}[]`.
  - `overrides[i] === undefined` → use `autoSymbols[i]` for slot `i`.
  - `overrides[i] === null` → slot `i` is removed (shows nothing).
  - `overrides[i]` is a non-empty string → replaces slot `i`'s symbol.
  - The current symbol and any duplicate symbol across slots is dropped (first occurrence wins, in slot order 0→4).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/research.test.js`:

```js
import { MAX_PEER_SLOTS, resolvePeerSlots } from './research'

describe('resolvePeerSlots', () => {
  it('returns the auto peers in slot order when there are no overrides', () => {
    const result = resolvePeerSlots('AAPL', ['MSFT', 'GOOGL'], [])
    expect(result).toEqual([
      { slot: 0, symbol: 'MSFT' },
      { slot: 1, symbol: 'GOOGL' },
    ])
  })

  it('replaces a slot with a manual override', () => {
    const result = resolvePeerSlots('AAPL', ['MSFT', 'GOOGL'], [undefined, 'AMZN'])
    expect(result).toEqual([
      { slot: 0, symbol: 'MSFT' },
      { slot: 1, symbol: 'AMZN' },
    ])
  })

  it('removes a slot explicitly overridden to null', () => {
    const result = resolvePeerSlots('AAPL', ['MSFT', 'GOOGL'], [null])
    expect(result).toEqual([{ slot: 1, symbol: 'GOOGL' }])
  })

  it('drops the current symbol if it appears among the auto peers', () => {
    const result = resolvePeerSlots('AAPL', ['AAPL', 'MSFT'], [])
    expect(result).toEqual([{ slot: 1, symbol: 'MSFT' }])
  })

  it('drops a duplicate symbol across slots, keeping the first', () => {
    const result = resolvePeerSlots('AAPL', ['MSFT', 'MSFT'], [])
    expect(result).toEqual([{ slot: 0, symbol: 'MSFT' }])
  })

  it('caps at MAX_PEER_SLOTS even with a longer auto list', () => {
    const auto = ['A', 'B', 'C', 'D', 'E', 'F']
    const result = resolvePeerSlots('AAPL', auto, [])
    expect(result).toHaveLength(MAX_PEER_SLOTS)
    expect(result.map((r) => r.symbol)).toEqual(['A', 'B', 'C', 'D', 'E'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/research.test.js`
Expected: FAIL — `resolvePeerSlots is not a function`.

- [ ] **Step 3: Implement**

Add to `frontend/src/lib/research.js` (near the other exported constants/helpers):

```js
export const MAX_PEER_SLOTS = 5

/** Which symbol (if any) shows in each of the fixed peer slots, after
 *  applying manual overrides on top of the auto peer list. Slot order is
 *  preserved; the current symbol and any repeat are dropped. */
export function resolvePeerSlots(currentSymbol, autoSymbols = [], overrides = []) {
  const current = (currentSymbol || '').toUpperCase()
  const seen = new Set([current])
  const slots = []
  for (let slot = 0; slot < MAX_PEER_SLOTS; slot += 1) {
    const override = overrides[slot]
    const candidate = override === null ? null : (override ? override.toUpperCase() : autoSymbols[slot])
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    slots.push({ slot, symbol: candidate })
  }
  return slots
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/research.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/research.js frontend/src/lib/research.test.js
git commit -m "feat: derive peer comparison slots from auto peers + overrides (Slice 5, Task 3)"
```

---

### Task 4: Frontend — API client + query hooks

**Files:**
- Modify: `frontend/src/api/client.js`
- Modify: `frontend/src/api/queries.js`
- Test: `frontend/src/api/client.test.js`

**Interfaces:**
- Consumes: `GET /api/research/peers/<symbol>/` from Task 2.
- Produces: `getPeers(symbol) -> Promise`, `queryKeys.peers(symbol)`, `usePeers(symbol)`, `usePeerFundamentals(symbols: string[])` (returns the array `useQueries` gives back — one `{data, isLoading, ...}` per symbol, same order).

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/api/client.test.js`, near the `getCompanyNews` test:

```js
it('getPeers hits the per-symbol peers route', async () => {
  window.fetch = vi.fn().mockResolvedValue(jsonResponse({ available: true, symbols: ['MSFT'] }))

  await getPeers('AAPL')

  expect(window.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/research/peers/AAPL/'),
    expect.anything()
  )
})
```

Add `getPeers` to that file's import list from `./client`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/api/client.test.js`
Expected: FAIL — `getPeers is not defined`.

- [ ] **Step 3: Implement**

In `frontend/src/api/client.js`, add next to `getCompanyNews`:

```js
export const getPeers = (symbol) => apiFetch(`/api/research/peers/${symbol}/`)
```

In `frontend/src/api/queries.js`:
- Add `getPeers` to the import from `./client`.
- Add to `queryKeys`, next to `companyNews`:

```js
  peers: (symbol) => ['peers', symbol],
```

- Add the hooks, next to `useCompanyNews`:

```js
// Peer sets rarely change; 24h matches the backend's own cache TTL.
export function usePeers(symbol) {
  return useQuery({
    queryKey: queryKeys.peers(symbol),
    queryFn: () => getPeers(symbol),
    enabled: !!symbol,
    staleTime: 24 * 60 * 60_000,
  })
}

// Same per-symbol fundamentals fetch useFundamentals uses, once per resolved
// peer slot - a manually swapped-in symbol goes through the identical path,
// and the cache is shared with any tab already showing that symbol.
export function usePeerFundamentals(symbols) {
  return useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: queryKeys.fundamentals(symbol),
      queryFn: () => getFundamentals(symbol),
      staleTime: 24 * 60 * 60_000,
    })),
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/api/client.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/queries.js frontend/src/api/client.test.js
git commit -m "feat: add peers API client + query hooks (Slice 5, Task 4)"
```

---

### Task 5: Frontend — PeersTab component

**Files:**
- Create: `frontend/src/components/research/PeersTab.jsx`
- Test: `frontend/src/components/research/PeersTab.test.jsx`

**Interfaces:**
- Consumes: `usePeers`, `usePeerFundamentals`, `useInstrumentSearch` (Task 4 + existing), `resolvePeerSlots`, `MAX_PEER_SLOTS` (Task 3), `FundamentalsGate` (existing), `fmtNum`/`fmtPct`/`fmtCompact` (existing).
- Produces: `export default function PeersTab({ symbol, fundamentals })`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/research/PeersTab.test.jsx`:

```jsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import PeersTab from './PeersTab'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

beforeEach(() => vi.clearAllMocks())

const CURRENT = {
  available: true,
  price_return_1y: 12.5,
  market_cap: 3_100_000,
  pe_ratio: 32.1,
  peg_ratio: 2.1,
  revenue_growth_ttm_yoy: 8.2,
  eps_growth_ttm_yoy: 14.0,
  net_margin: 25.3,
  roe: 45.1,
  recommendation: { strong_buy: 10, buy: 5, hold: 2, sell: 0, strong_sell: 0 },
}

const PEER = {
  available: true,
  price_return_1y: 5.0,
  market_cap: 2_000_000,
  pe_ratio: 28.0,
  peg_ratio: 1.8,
  revenue_growth_ttm_yoy: 6.0,
  eps_growth_ttm_yoy: 9.0,
  net_margin: 20.0,
  roe: 30.0,
  recommendation: { strong_buy: 2, buy: 8, hold: 3, sell: 0, strong_sell: 0 },
}

function stub({ peersData = { available: true, symbols: ['MSFT'] }, peerResults = [{ data: PEER, isLoading: false }] } = {}) {
  queries.usePeers.mockReturnValue({ data: peersData, isLoading: false })
  queries.usePeerFundamentals.mockReturnValue(peerResults)
  queries.useInstrumentSearch.mockReturnValue({ data: [] })
}

describe('PeersTab', () => {
  it('shows the current symbol and its auto peers as columns', () => {
    stub()
    render(<PeersTab symbol="AAPL" fundamentals={{ data: CURRENT, isLoading: false }} />)
    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('MSFT')).toBeInTheDocument()
    expect(screen.getByText('Strong buy')).toBeInTheDocument()
  })

  it('shows a dash for a peer whose fundamentals are unavailable', () => {
    stub({ peerResults: [{ data: { available: false, reason: 'x' }, isLoading: false }] })
    render(<PeersTab symbol="AAPL" fundamentals={{ data: CURRENT, isLoading: false }} />)
    const cells = screen.getAllByText('—')
    expect(cells.length).toBeGreaterThan(0)
  })

  it('removes a peer column when its remove button is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    stub()
    render(<PeersTab symbol="AAPL" fundamentals={{ data: CURRENT, isLoading: false }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove MSFT' }))
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument()
  })

  it('falls back to the fundamentals gate when the current symbol has no data', () => {
    stub()
    render(<PeersTab symbol="AAPL" fundamentals={{ data: { available: false, reason: 'nope' }, isLoading: false }} />)
    expect(screen.getByText('nope')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/research/PeersTab.test.jsx`
Expected: FAIL — cannot find module `./PeersTab`.

- [ ] **Step 3: Implement**

Create `frontend/src/components/research/PeersTab.jsx`:

```jsx
import { useDeferredValue, useMemo, useState } from 'react'
import { X } from 'lucide-react'

import { useInstrumentSearch, usePeerFundamentals, usePeers } from '../../api/queries'
import { fmtCompact, fmtNum, fmtPct } from '../../lib/format'
import { MAX_PEER_SLOTS, resolvePeerSlots } from '../../lib/research'
import { Card, CardHeader, Skeleton } from '../ui'
import FundamentalsGate from './FundamentalsGate'

const RECOMMENDATION_LABELS = [
  ['strong_buy', 'Strong buy'],
  ['buy', 'Buy'],
  ['hold', 'Hold'],
  ['sell', 'Sell'],
  ['strong_sell', 'Strong sell'],
]

function dominantRecommendation(rec) {
  if (!rec) return null
  let best = null
  for (const [key, label] of RECOMMENDATION_LABELS) {
    const count = rec[key] || 0
    if (!best || count > best.count) best = { label, count }
  }
  return best && best.count > 0 ? best.label : null
}

const METRIC_ROWS = [
  { key: 'price_return_1y', label: '1Y return', format: (v) => fmtPct(v) },
  { key: 'market_cap', label: 'Market cap', format: (v) => fmtCompact(v) },
  { key: 'pe_ratio', label: 'P/E', format: (v) => fmtNum(v, 2) },
  { key: 'peg_ratio', label: 'PEG', format: (v) => fmtNum(v, 2) },
  { key: 'revenue_growth_ttm_yoy', label: 'Revenue growth (YoY)', format: (v) => fmtPct(v, { sign: false }) },
  { key: 'eps_growth_ttm_yoy', label: 'EPS growth (YoY)', format: (v) => fmtPct(v, { sign: false }) },
  { key: 'net_margin', label: 'Net margin', format: (v) => fmtPct(v, { sign: false }) },
  { key: 'roe', label: 'ROE', format: (v) => fmtPct(v, { sign: false }) },
  { key: 'recommendation', label: 'Analyst view', format: (v) => dominantRecommendation(v) ?? '—' },
]

/** One empty slot's inline search: pick a symbol to add as a manual peer. */
function AddPeerSearch({ onPick }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const { data: results = [] } = useInstrumentSearch(deferredQuery)

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Add peer"
        aria-label="Add peer"
        className="w-full h-7 px-2 bg-zinc-950 border border-white/10 rounded text-[11.5px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500/60"
      />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto bg-zinc-900 border border-white/10 rounded shadow-lg">
          {results.map((result) => (
            <button
              key={`${result.uic}-${result.asset_type}`}
              type="button"
              onClick={() => {
                onPick(result.symbol)
                setQuery('')
              }}
              className="w-full text-left px-2 h-7 text-[11.5px] text-zinc-100 hover:bg-white/[0.06]"
            >
              {result.symbol}
              <span className="text-zinc-500 ml-1.5 truncate">{result.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PeersTab({ symbol, fundamentals }) {
  const peers = usePeers(symbol)
  const [overrides, setOverrides] = useState([])

  const autoSymbols = peers.data?.available ? peers.data.symbols : []
  const overridesKey = JSON.stringify(overrides)
  const autoSymbolsKey = JSON.stringify(autoSymbols)
  const slots = useMemo(
    () => resolvePeerSlots(symbol, autoSymbols, overrides),
    // autoSymbols/overrides are recreated every render; their JSON is the stable dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbol, autoSymbolsKey, overridesKey],
  )
  const peerResults = usePeerFundamentals(slots.map((s) => s.symbol))

  const setOverride = (slot, value) => {
    setOverrides((prev) => {
      const next = [...prev]
      next[slot] = value
      return next
    })
  }

  const filledSlots = new Set(slots.map((s) => s.slot))
  const nextEmptySlot = Array.from({ length: MAX_PEER_SLOTS }).findIndex((_, i) => !filledSlots.has(i))

  return (
    <FundamentalsGate fundamentals={fundamentals} title="Peers" fallback="Peer data is unavailable for this symbol.">
      {(currentData) => (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <CardHeader title="Peer comparison" subtitle="Valuation, growth and quality, side by side" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wide text-zinc-600 font-medium">
                    {symbol}
                  </th>
                  {slots.map((s, i) => (
                    <th key={s.symbol} className="text-right px-3 py-2 font-medium">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-zinc-100">{s.symbol}</span>
                        <button
                          type="button"
                          onClick={() => setOverride(s.slot, null)}
                          aria-label={`Remove ${s.symbol}`}
                          className="text-zinc-600 hover:text-red-400"
                        >
                          <X size={11} />
                        </button>
                      </div>
                      {peerResults[i]?.isLoading ? <Skeleton className="h-3 w-12 ml-auto mt-1" /> : null}
                    </th>
                  ))}
                  {nextEmptySlot !== -1 ? (
                    <th className="text-right px-3 py-2 w-40">
                      <AddPeerSearch onPick={(sym) => setOverride(nextEmptySlot, sym)} />
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((row) => (
                  <tr key={row.key} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-2 text-zinc-500">{row.label}</td>
                    <td className="px-3 py-2 num font-mono text-right text-zinc-100">
                      {row.format(currentData[row.key])}
                    </td>
                    {slots.map((s, i) => {
                      const peerData = peerResults[i]?.data
                      const unavailable = peerData && peerData.available === false
                      return (
                        <td key={s.symbol} className="px-3 py-2 num font-mono text-right text-zinc-300">
                          {unavailable ? '—' : row.format(peerData?.[row.key])}
                        </td>
                      )
                    })}
                    {nextEmptySlot !== -1 ? <td /> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </FundamentalsGate>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/research/PeersTab.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/PeersTab.jsx frontend/src/components/research/PeersTab.test.jsx
git commit -m "feat: add the PeersTab comparison table (Slice 5, Task 5)"
```

---

### Task 6: Wire the Peers tab into the Research page

**Files:**
- Modify: `frontend/src/pages/Research.jsx`
- Modify: `frontend/src/pages/Research.test.jsx`

**Interfaces:**
- Consumes: `PeersTab` from Task 5.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/pages/Research.test.jsx`, near the "shows the valuation tab" test:

```jsx
it('shows the peers tab', async () => {
  renderWithProviders(<Research />)
  await userEvent.click(screen.getByRole('button', { name: 'Peers' }))
  expect(screen.getByText('Peer comparison')).toBeInTheDocument()
})
```

Add `queries.usePeers.mockReturnValue({ ...idle, data: { available: false } })` and `queries.usePeerFundamentals.mockReturnValue([])` to `stubQueries`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/Research.test.jsx`
Expected: FAIL — no "Peers" button.

- [ ] **Step 3: Implement**

In `frontend/src/pages/Research.jsx`:
- Import `PeersTab` next to the `OverviewTab` import.
- Add `['peers', 'Peers']` to the `TABS` array, after `['valuation', 'Valuation']`.
- Render it next to the other conditional tabs:

```jsx
{tab === 'peers' ? <PeersTab symbol={symbol} fundamentals={fundamentals} /> : null}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/Research.test.jsx`
Expected: PASS.

- [ ] **Step 5: Run the full frontend suite and lint**

Run: `cd frontend && npx vitest run && npx eslint src`
Expected: All tests pass, lint clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Research.jsx frontend/src/pages/Research.test.jsx
git commit -m "feat: add the Peers tab to the Research page (Slice 5, Task 6)"
```
