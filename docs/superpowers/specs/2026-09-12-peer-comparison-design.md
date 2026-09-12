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

- `finnhub.py`: add `get_peers(symbol)` calling Finnhub's `/stock/peer`.
  Cached per symbol under the existing `CACHE_V` scheme with a long TTL
  (peer sets rarely change).
- `GET /api/research/<symbol>/peers/`: resolves peers (capped at 5), calls
  the existing `fundamentals()` for each (already cached per-symbol — no new
  heavy computation), returns:
  ```json
  {"symbol": "AAPL", "peers": [{"symbol": "MSFT", ...metrics}, ...]}
  ```
- A peer that fails to resolve (delisted, no data) is dropped silently —
  same best-effort convention as earnings/news.

## Comparison metrics

One row each, current symbol pinned as the first column:

price return 1Y · market cap · PE · PEG · forward PE ·
revenue growth (TTM YoY) · EPS growth (TTM YoY) ·
net margin · ROE · analyst recommendation

All already computed by `to_fundamentals()` — no new metric derivation.

## Frontend

- New "Peers" tab alongside Overview/Valuation/Earnings/News on the Research
  page.
- Table auto-populates from `/api/research/<symbol>/peers/`.
- Each peer column has a "×" to remove and an "add" slot that reuses the
  existing symbol-search component (the one Watchlist's add-item flow uses)
  to swap in any manual symbol.
- Manual swaps are session-local only (component state) — not persisted, no
  new model/migration.

## Testing

- Backend: `get_peers` unit test (happy path, empty, Finnhub error); endpoint
  test (happy path, empty peers, one peer failing to resolve).
- Frontend: comparison-table render test; swap-interaction test — following
  the pattern in `EarningsTab.test.jsx`.

## Out of scope

- Market-wide discovery/screener (see Problem section).
- Persisting manual peer swaps.
- New database models — this slice is read-only, computed from existing
  fundamentals data.
