# Earnings terminal — standalone page pivot

**Type:** bounded pivot of an existing feature (Phase 2 of the Earnings work). Implemented directly in-session with TDD + gates + one review pass — no subagent choreography.

**Design reference:** the `Earnings Terminal` canvas (mock) — week-nav calendar, `All / Mine` toggle, per-day docket split Before open / After close, reported rows show actual + beat/miss, row click → Research.

**Memory:** [[saxodash-earnings-feature]] (agreed pivot section).

**Goal:** the `/earnings` page defaults to the **whole US-market** calendar for one week, navigable week-by-week, with a filter to the user's holdings + watchlists. Deletes the per-symbol fan-out.

---

## Backend — `backend/research/`

### `finnhub.py`
- `get_earnings_calendar(symbol=None, date_from, date_to)` — make `symbol` optional; when falsy, omit it from the params so `/calendar/earnings?from=&to=` returns the whole market.

### `earnings.py`
- **New** `MONDAY_OF(d)` helper → the Monday of `d`'s week.
- **New** `window_earnings(scope, week_offset)`:
  - `start = MONDAY_OF(date.today()) + timedelta(weeks=week_offset)`, `end = start + timedelta(days=6)`.
  - `cache.get_or_set('research:earnings-week:{start.isoformat()}', ..., EARNINGS_CAL_TTL)` around one `_market_week(start, end)` call → `sorted(_shape(r) for r in rows if r['date'])` by `(date, symbol)`. **Not** keyed by scope — fetch the week once, filter in-app.
  - `held = set(Position.objects.values_list('ticker', flat=True))` upper-cased; `watched = {s.upper() for s in WatchlistItem.objects.values_list('symbol', flat=True)} - held`.
  - Tag every event: `held: bool`, `watched: bool`, `mine: held or watched`.
  - `scope == 'mine'` → keep only `mine` rows.
  - On `ProviderUnavailable` from the fetch: return `{events: [], window, ok: False}`. Else `{events, window: {'from', 'to', 'week': week_offset}, ok: True}`.
- **New** `_market_week(start, end)` → `finnhub.get_earnings_calendar(None, start.isoformat(), end.isoformat()).get('earningsCalendar', [])`.
- **Delete** `upcoming_earnings` and `MAX_FANOUT_SYMBOLS`. Keep `_shape`, `_surprise`, `_fetch_calendar` (still used by `symbol_earnings`), `tracked_symbols` (still referenced elsewhere? check — if not, delete it too).
- `symbol_earnings` — unchanged.

### `views.py`
- `EarningsCalendarView.get`: `scope = request.query_params.get('scope', 'all')` — `ValidationError` if not in `{'all', 'mine'}`. `week = int(request.query_params.get('week', 0))` in a `try/except ValueError → ValidationError`; clamp to `-8..12`. Return `Response(earnings.window_earnings(scope, week))`.
- `SymbolEarningsView` — unchanged.

### Tests (`tests.py`)
- `window_earnings`: one upstream call for the whole week (assert `get_earnings_calendar.call_count == 1`, symbol arg `None`); week-offset math; `mine` filter drops non-tracked; `held` / `watched` tagging from real `Position` + `WatchlistItem` rows; day-stamped cache hit on a second call; `ProviderUnavailable` → `{events: [], ok: False}`.
- `EarningsCalendarView`: default (`scope=all`, `week=0`); `?scope=mine`; `?week=2`; bad `scope` → 400; bad `week` → 400.
- Drop the old `UpcomingEarningsTest` / fan-out-cap test.

---

## Frontend — `frontend/src/`

### `api/client.js`
- `getEarningsCalendar(scope = 'all', week = 0)` → `/api/research/earnings/calendar/?scope=${scope}&week=${week}`.

### `api/queries.js`
- `useEarningsCalendar(scope = 'all', week = 0)` — `queryKey: ['earnings-calendar', scope, week]`, `queryFn: () => getEarningsCalendar(scope, week)`, `staleTime: 12 * 60 * 60_000`.

### `lib/earnings.js` (replace `bucketEarnings` / `BUCKET_ORDER`)
- `WEEKDAYS = [['mon','Mon'],['tue','Tue'],['wed','Wed'],['thu','Thu'],['fri','Fri']]` (+ `sat`/`sun` appended only when those groups are non-empty).
- `groupByWeekday(events)` → `{ mon: [...], ... }`, each list kept in input order.
- `weekLabel(window)` → `"Oct 26 – 30 · October 2026"` from `window.from` / `window.to` (`toLocaleDateString`, collapse the month when both ends share it).
- Pure; unit-tested with a fixed set of dated events.

### `pages/Earnings.jsx` (rewrite around the mock)
- State: `scope` (`'all'`), `week` (`0`), `day` (`'mon'`), `opened` unused now — row click navigates.
- `const { data, isLoading, error } = useEarningsCalendar(scope, week)`.
- **Header** + segmented `All / Mine` (reuse the `Pill`/segmented pattern from `Analytics.jsx`).
- **Week nav**: `‹` / `›` buttons (clamp -8..12), `weekLabel(data.window)` between them; a one-line summary (`N report this week · M on your lists · heaviest <day>`).
- **Week strip**: 5 (–7) day cards from `groupByWeekday(data.events)` — weekday + date, a count badge tinted by `count` (blue ramp, flat at 0), first 3 tickers + `+N`, selected card gets a blue bottom border; click → `setDay`.
- **Docket** for `day`: rows sorted by revenue estimate desc, split `session === 'bmo'` / `'amc'`, a thin uppercase column-label row (`EPS · act / est`, `Surprise`, `Revenue`), and a legend line under the card.
- **Row** (`EarningsRow`, local component): ticker (blue when `held`) + `Held`/`Watchlist` tag · company · session chip · EPS cell — **reported** (`eps_actual != null`) shows `eps_actual` + a `▴/▾ N%` chip from `eps_surprise_pct` + `est <eps_estimate>`; **upcoming** shows `<eps_estimate>e` · revenue estimate (`fmtCompact(rev/1e6)`). `held` → blue left border; reported → green/red `box-shadow: inset 3px 0 0`. Whole row is a `<button>`; click → `navigate('/research?symbol=' + symbol + '&tab=earnings')`.
- **States**: `isLoading` → a Card "Loading…"; `error` → a Card "Couldn't load the earnings calendar." (keep the Phase-1 error branch); `data.ok === false` → same error copy; `events` empty for the selected day → "No companies report <day>." with, in `mine` scope, a "View all →" that flips `scope` to `all`.
- Keep row/strip as local components in this file (matches `Analytics.jsx`'s local `PerformanceTab`/`RiskTab`); if it runs past ~230 lines, split `EarningsRow` into `components/research/` or a new `components/earnings/`.

### `lib/chartState.jsx` + `components/research/ChartPanel.jsx` + `pages/Research.jsx`
- `chartPlaceholderFor` gains optional `symbol` + `unresolved`. When `!isLoading && !error && count === 0 && unresolved` → `<ChartPlaceholder>No price history for {symbol} in Saxo's feed. The Earnings tab below is unaffected.</ChartPlaceholder>` instead of the bare "No data yet".
- `ChartPanel` forwards `symbol` + `unresolved` into `chartPlaceholderFor`.
- `Research.jsx` passes `symbol={symbol}` and `unresolved={!instrument && !chart.isLoading}` to `ChartPanel`.

### Tests
- `lib/earnings.test.js` — rewrite for `groupByWeekday` + `weekLabel`.
- `pages/Earnings.test.jsx` — rewrite: `vi.mock('../api/queries')`; toggle switches scope + refetches; week `‹/›` change `week`; day select changes the docket; a reported row renders actual + the surprise chip; an upcoming row renders `…e`; error and empty states.
- `api/client.test.js` — `getEarningsCalendar('mine', 2)` hits the right query string.
- Delete stale assertions tied to `bucketEarnings` / the old agenda.

---

## Deliberately cut from v1 (revisit later)

- **The 4-quarter surprise streak column.** It needs per-symbol history (`/stock/earnings`), which is the fan-out we're removing. Reported rows still show *their own* beat/miss. Fast-follow: a bounded enrichment for `scope=mine` only (small N), cached 24h.
- Weekend (`sat`/`sun`) columns render only if Finnhub returns events there — no dedicated design.
- No "recent + next 30d" long view — week nav replaces it.

## Gate (run before the single review + before merge)

```
cd backend && .venv/bin/python manage.py test
cd frontend && npm run test && npm run lint && npm run build
```

## Branch

`earnings-terminal` off `main`. One review pass at the end (inline, or one subagent), then merge + push.
