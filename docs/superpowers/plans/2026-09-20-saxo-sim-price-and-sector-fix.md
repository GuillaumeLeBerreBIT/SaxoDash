# Saxo SIM zero-price + missing sector classification

**Status:** Root cause 1 (zero/negative derived price) **fixed and verified live** 2026-09-20, at the user's explicit request after reviewing the Portfolio redesign. Root cause 2 (sector classification) is **still open** — deliberately not attempted in the same pass, since it's a distinct feature (a new data source, Finnhub company-profile lookups) rather than a one-line guard, and needs its own design pass (see below).

Originally diagnosed 2026-09-20 during the Dashboard UI redesign pass and deferred (functional/backend, out of scope for that pass). Picked back up the same day when the user asked to see it fixed rather than left for later.

**Symptom:** Every `Position` currently has `current_price = 0.00`, so `value` (`qty * current_price * fx_rate`) is 0 for all 6 holdings. This cascades into:
- Portfolio/Dashboard weight = 0.0% for every holding, including the "top" one (a same-weight tie, so whichever sorts first wins the label).
- `pnl_pct` = -100% for every position (shown as "Movers" gainers/losers all at -100%, which reads as nonsensical since "gainers" are all losses).
- `ExposureCard`'s sector/currency donuts render "No holdings yet." — `portfolio/insights.py::_exposure()` early-returns `[]` when `total` (sum of position values) is 0, which it always is right now.

**Root cause 1 — `saxo/mapping.py::_mark()` accepts a degenerate "derived" price of exactly 0 — FIXED.**
Verified against live Saxo SIM data (not simulated): for every position, `ProfitLossOnTrade == -(OpenPrice * Amount)` exactly (e.g. AAPL: `OpenPrice=332.54, Amount=10, ProfitLossOnTrade=-3325.40` → derived price = `332.54 + (-3325.40/10) = 0.00`). This is Saxo SIM's own way of saying "this position has no market-data entitlement, treat it as fully unpriced" — it is not a bug in the derivation formula itself, which is otherwise correct and already documented as the intended fallback for a real funded account.

The bug was that `_mark()` had no validation step: it silently accepted this degenerate 0 as a legitimate `'derived'` price instead of recognizing it as invalid and falling through to the third tier that already existed for exactly this situation — `'cost'` (`open_price`, tagged `price_source='cost'`, whose own model comment reads *"we could not price the position at all and are showing what you paid for it"*).

**Fix applied** (`backend/saxo/mapping.py::_mark()`): the derived price is now rejected (falls through to `open_price`/`'cost'`) whenever it's `<= 0`, not just when the inputs are missing. Two regression tests added to `saxo/tests.py::UnentitledPositionPricingTest` covering the exact SIM shape (`ProfitLossOnTrade == -OpenPrice * Amount` → zero) and a large-loss case that would derive negative; both now correctly report `price_source == 'cost'`. Full backend suite (571 tests) passes.

**Verified live**, not just in tests: re-ran `saxo.tasks.sync_positions()` against the real connected SIM account. 5 of 6 positions now get a real positive `derived` price (e.g. NBIS: `€0.00 → €223.61`, `value €0 → €5,843.82`); the 6th (MSFT) correctly falls through to `'cost'` since its own derived price was still non-positive even after the fix, and the existing "AT COST" disclosure UI picked that up automatically with no frontend change needed. Weight, P&L%, the Holdings allocation donut, and Gainers & Losers all now show real, correctly-varied figures instead of the uniform 0%/-100% wall.

**Root cause 2 — `sector` is hardcoded, not classified — STILL OPEN.**
`to_position_fields()` (`backend/saxo/mapping.py`) sets `'sector': 'Uncategorized'` unconditionally — there is no sector-classification logic anywhere in the Saxo sync. This is independent of root cause 1 and was **not** fixed in this pass: with real prices now flowing, the Exposure/Sector-breakdown donuts render correctly, but as a single "100% Uncategorized" slice rather than a real sector split (verified live 2026-09-20, post-fix screenshot).

**Fix sketch:** Research's Finnhub integration already fetches company-profile data (including sector) for fundamentals — reuse that client during the Saxo position sync to backfill `sector` per ticker (keyed the same way Research already resolves a symbol), falling back to `'Uncategorized'` only when Finnhub has no data for that instrument (e.g. some ETFs). Needs its own design pass: whether to fetch at sync time (rate-limit implications, matches the existing "sync" cadence) or lazily/cached like Research's fundamentals already are.

**Scope note:** this remaining fix is backend-only (`saxo/mapping.py`, plus tests, plus wiring to the Finnhub client). No frontend/UI change is implied — the donut/legend already render correctly for however many real sector buckets exist; they'll simply show more than one once this lands.

## Symptoms — resolved by root cause 1's fix (verified live 2026-09-20)

- [x] **Weight was 0.0% for every holding** — now real (e.g. NBIS 19.0%, MSFT 28.0%). `Position.weight_of()` needed no change; it was already correct on bad input.
- [x] **Movers/Gainers&Losers showed every position at -100%** — now a real, varied spread (mostly positive gains in the current data).
- [x] **Portfolio's "Holdings allocation" donut rendered an empty state** — now a real 6-slice per-ticker donut.
- [x] **Portfolio's totals row P&L was an implausible `-€29,875.49`** — now a realistic `+€902.57`.

## Symptoms — NOT resolved (blocked on root cause 2, still open)

- [ ] **`ExposureCard`'s sector donut (Dashboard) and Portfolio's "Sector breakdown" donut both render a single "100% Uncategorized" slice**, not a real sector split. This is expected until root cause 2 is fixed — the donut/legend code itself is correct and needs no further change.

## What is genuinely unrelated (do not fold into this fix)

- The "Reconnect Saxo" button on Portfolio reflects a real, separate OAuth/session state (needs reauth) — not caused by the pricing bug and not fixed by it.
