# Fundamentals provider (Finnhub) — company fundamentals for Research

## Context

Research shipped as v1 = everything Saxo can power (candles, quotes, instrument
search, watchlists). Company fundamentals and macro data were explicitly
deferred to a second data provider (`AGENTS.md`, "Research shipped as v1").
Three `ComingSoon` placeholders are currently live: `OverviewTab.jsx`'s
fundamentals half, and the Valuation and Market-context tabs in
`Research.jsx`.

**Provider decision:** Finnhub, free tier. Chosen over FMP/EODHD/Tiingo for
personal, non-commercial use — see chat history for the comparison. Free tier
is 60 calls/min with real fundamentals, no daily-call ceiling to worry about
at this project's scale (a handful of symbols, fetch-on-demand).

**This pass's scope:** company fundamentals only — Overview's fundamentals
half + a full Valuation tab. Market-context (Buffett indicator, macro series)
is deferred again: it needs a second, unrelated data source (FRED for
GDP/VIX/US10Y; no clean free source yet identified for Shiller CAPE) and
shouldn't be tangled with this pass.

**Symbol scope:** any instrument the Research page opens, fetched on demand
and cached — same pattern as the existing Saxo chart/quote/instrument
proxies, not a pre-populated background sync limited to held positions.

**Verified against Finnhub's actual docs during design** (not assumed):
price targets (`/stock/price-target`) and dividend payment history
(`/stock/dividend`) are Premium-only despite some marketing pages implying
otherwise — excluded from this pass. "Financials As Reported" is also
Premium-only. The free `/stock/metric?metric=all` bundle covers P/E, market
cap, dividend *yield* (a computed metric, distinct from the premium dividend
*history*), and 52-week range — confirmed field names still need checking
against one real live call before the mapping is finalized (see Open
Questions).

## Decisions

**Backend owner: `research` app, not a new app.** `research/market.py`
already owns exactly this shape of work for Saxo (credential/config → call →
shape → cache, tiered TTLs), and AGENTS.md already frames `research` as
owning "this page's data needs end-to-end." A new `research/finnhub.py` next
to `market.py` fits that seam directly. No new Django app, no new models —
fetch-on-demand + cache needs neither.

**Combined endpoint, not four granular ones.** `GET
/api/research/fundamentals/<symbol>/` returns one shaped payload (profile +
valuation metrics + recommendation trend + EPS surprise history) behind one
cache entry. Overview and Valuation both read overlapping fields from the
same symbol, so one call/one cache key is simpler than Saxo's four-endpoint
split, which exists because those four things (chart/quote/search/details)
genuinely age at different rates and are called from different places.
Fundamentals don't move intraday — one 24h TTL for the whole payload.

**Symbol, not uic.** Finnhub is keyed by ticker symbol, not Saxo's uic.
`saxo.mapping.bare_symbol()` already strips the exchange suffix
(`'NVDA:xnas'` → `'NVDA'`) as the join key between positions, watchlist rows,
and the Research URL — reused here unchanged. This works cleanly for
US-listed tickers, which is every symbol in the current portfolio. An
international listing needing an exchange suffix (e.g. `SAP.DE`) will not
resolve correctly — a known, out-of-scope gap for this pass, not silently
"handled."

**Config, not credential.** Finnhub needs one static API key
(`FINNHUB_API_KEY`), not a per-user OAuth flow like Saxo. No DB row, no
`active_credential()`-style lookup — a missing key is a settings problem,
checked once per call.

**Error shape: always 200, `available: false` on failure — not a 409.**
AGENTS.md already decided "409 means the app is not connected to Saxo,"
named once in `api/client.js`. Reusing 409 for an unrelated "Finnhub isn't
configured/failed" meaning would break that rule. Instead, the view always
returns 200 with `{available: false, reason: '...'}` on a missing key or a
Finnhub API error — the same shape Analytics already uses for
`_empty_benchmark`. The frontend checks a boolean field, not a status code.

**Ratios computed in-app from whatever the free tier actually returns.**
P/S, P/B, PEG, margins, ROE etc. are computed here, not pre-published by
Finnhub (matches the original v2 outline's "computed in-app, not
pre-published" note). Ratios needing inputs the free `metric` bundle doesn't
carry (e.g. EV/EBITDA, EV/Sales need debt/cash figures that may not be in the
free bucket) are omitted from the response entirely rather than computed
from a guess or a null treated as zero — matches AGENTS.md's "an absent
figure is not zero" rule. Which ratios actually make it in depends on the
live-call verification below, not on this document's wishlist.

## Backend

`research/finnhub.py` (mirrors `market.py`'s shape):

- `_finnhub_call(fn, *args, **kwargs)`: reads `settings.FINNHUB_API_KEY`;
  empty/missing → `FinnhubNotConfigured`; Finnhub responds non-200 →
  `FinnhubAPIError`. Both are caught by the view, not the caller.
- Three client functions, each a thin `requests.get` wrapper matching
  `saxo/client.py`'s style (raise on non-200, return parsed JSON):
  - `get_profile(symbol)` → `/stock/profile2`
  - `get_basic_financials(symbol)` → `/stock/metric?metric=all`
  - `get_recommendation_trends(symbol)` → `/stock/recommendation`
  - `get_earnings_history(symbol)` → `/stock/earnings`
- `fundamentals(symbol)`: calls all four, shapes into one payload, cached
  under `research:fundamentals:{symbol}` for 24h (`FUNDAMENTALS_TTL = 86400`
  alongside `market.py`'s other TTL constants).
- Shaping renames Finnhub's payload into the app's snake_case convention,
  same as `to_instrument`/`to_candle` do for Saxo. Exact output field list is
  finalized against a real API response (Open Questions), not written here
  as a guess.

`research/views.py`: one `FundamentalsView(APIView)`, GET only, path param
`symbol`. Calls `finnhub.fundamentals(symbol)`; on
`FinnhubNotConfigured`/`FinnhubAPIError` returns `{available: False, reason:
str(exc)}` with status 200; otherwise `{available: True, **payload}`.

`research/urls.py`: `path('fundamentals/<str:symbol>/', FundamentalsView.as_view())`.

`backend/settings.py`: `FINNHUB_API_KEY = os.environ.get('FINNHUB_API_KEY', '')`.
`backend/.env.example`: add `FINNHUB_API_KEY=` with a comment pointing at
Finnhub's free signup.

## Frontend

- `api/client.js`: `getFundamentals(symbol)`.
- `api/queries.js`: `queryKeys.fundamentals(symbol)`, `useFundamentals(symbol)`
  (`enabled: !!symbol`, long `staleTime` matching the 24h backend cache — no
  point refetching sooner than the cache can change).
- `OverviewTab.jsx`: fundamentals half's `ComingSoon` replaced with real
  metrics (P/E, market cap, dividend yield, 52-week range) once
  `data.available`; `ComingSoon` stays as the `!available` fallback so an
  unconfigured key or an unresolvable international symbol degrades
  visibly, not silently.
- New `ValuationTab.jsx`: in-app ratios, recommendation-trend bar
  (buy/hold/sell/strongBuy/strongSell counts), EPS-surprise history chart
  (actual vs. estimate per quarter, reusing existing chart conventions).
  Wired into `Research.jsx` replacing the `tab === 'valuation'` `ComingSoon`.
- Small `FundamentalsNote` badge (same spirit as the existing
  `PriceBasisNote`) shown when `!available`, surfacing `reason` rather than
  a blank panel.

## Testing

- Backend: mock `requests.get` at the client boundary (matches
  `saxo`/`research` existing pattern) for `finnhub.py` shaping tests.
  `APITestCase` for `FundamentalsView`: configured+happy path, missing key,
  Finnhub error — all three asserted as 200 with the right `available`/`reason`.
- Frontend: `ValuationTab`/`OverviewTab` component tests with mocked query
  data for both `available: true` and `available: false`; `client.test.js`
  gets a `getFundamentals` case.

## Open questions (resolve during implementation, not here)

1. **Exact free-tier field names for `/stock/metric?metric=all`** — the
   ~117-metric bundle's precise field names (e.g. whether dividend yield is
   `dividendYieldIndicatedAnnual` or similarly named, whether any
   debt/cash-derived fields are present for EV ratios) need checking against
   one real authenticated call before `finnhub.py`'s shaping function is
   written — the same "verify against a real response before finalizing the
   mapping" gate the Saxo integration used repeatedly (`DisplayAndFormat`
   mistake, Task 4 Step 6). Do not guess field names into the shaping code.
2. **EPS-surprise history depth** — how many quarters `/stock/earnings`
   returns on the free tier is unconfirmed; the chart's x-axis range depends
   on this.

## Out of scope (this pass)

- Market-context tab, Buffett indicator, macro series (FRED or otherwise).
- Any non-US / non-suffix-stripped symbol resolution.
- Price targets, dividend payment history, "Financials As Reported"
  (confirmed Premium-only).
- Background/Celery-driven fundamentals refresh — fetch-on-demand only.
