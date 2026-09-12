# Peer comparison (Slice 5) — design

## Problem

Research pages show one company in isolation. There's no way to sanity-check
a valuation or growth number against similar companies, and no way to line up
a handful of tickers side by side. The 2026-09-10 workspace plan explicitly
parked "peers / comparison / discovery" as out of scope; the 2026-09-12
earnings-intelligence spec re-listed it as the next slice.

Full market discovery/screening (browse-by-filter across the whole market) is
explicitly **not** part of this slice — it needs bulk fundamentals across a
broad universe that neither the free Finnhub tier nor the per-symbol caching
model here supports. That's a separate, larger feature if ever pursued.

## Scope

One "Peers" tab on the Research page for a symbol, auto-populated with that
company's peers, doubling as an ad-hoc compare tool via manual swap.

## Backend

- `finnhub.py`: add `get_peers(symbol)` calling Finnhub's `/stock/peers`.
- `peers(symbol)`: resolves the raw peer list, drops the query symbol itself
  (Finnhub includes it), caps at 5, caches the result with a long TTL (peer
  sets rarely change). Returns `{"available": true, "symbols": [...]}` —
  symbols only, no embedded metrics.
- `GET /api/research/<symbol>/peers/`: thin wrapper, same `provider_response`
  pattern as `FundamentalsView`.
- Per-peer metrics are **not** fetched server-side. The frontend already has
  a cached, per-symbol `fundamentals` fetch (`useFundamentals` /
  `getFundamentals`) — reusing it for each peer symbol means auto peers and
  a manually swapped-in symbol go through the exact same code path, and a
  peer whose fundamentals come back `available: false` degrades the same way
  a directly-researched symbol does. This keeps the peers endpoint itself
  small and avoids doing N Finnhub round-trips inside one request.

## Comparison metrics

One row each, current symbol pinned as the first column:

price return 1Y · market cap · PE · PEG · forward PE ·
revenue growth (TTM YoY) · EPS growth (TTM YoY) ·
net margin · ROE · analyst recommendation

All already computed by `to_fundamentals()` — no new metric derivation.

## Frontend

- New "Peers" tab alongside Overview/Valuation/Earnings/News on the Research
  page.
- Up to 5 peer slots, seeded from `/api/research/<symbol>/peers/`. A pure
  `resolvePeerSymbols(currentSymbol, autoSymbols, overrides)` helper
  (`lib/research.js`) merges the auto list with any manual overrides,
  dropping duplicates and the current symbol.
- Metrics for every slot (auto or manually swapped) come from the existing
  per-symbol `fundamentals` fetch, run for all resolved slot symbols at once
  via React Query's `useQueries` — the same cached data `useFundamentals`
  would return for that symbol on its own Research page.
- Each column has a "×" to clear the slot and an "add" affordance that
  reuses the existing symbol-search input pattern (the one in
  `WatchlistRail`) to swap in a manual symbol.
- Manual swaps are session-local only (component state) — not persisted, no
  new model/migration.

## Testing

- Backend: `get_peers` unit test (params/URL); `peers()` unit test (drops
  the query symbol, caps at 5, caches); endpoint test (happy path, not
  configured, Finnhub error, malformed symbol rejected) — mirroring
  `FundamentalsClientTest`/`FundamentalsViewTest`.
- Frontend: `resolvePeerSymbols` unit tests (dedup, override, cap at 5);
  `PeersTab` render test (loading, unavailable, swap-interaction) —
  following the pattern in `EarningsTab.test.jsx`.

## Out of scope

- Market-wide discovery/screener (see Problem section).
- Persisting manual peer swaps.
- New database models — this slice is read-only, computed from existing
  fundamentals data.
