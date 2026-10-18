# Earnings page redesign — portfolio first

Date: 2026-10-18. Branch: `feat/earnings-redesign` (built on `fix/earnings-weekend-week`).

## Why

The Earnings page is a market-wide day docket: four summary tiles about the whole
market, a day-card rail, then one long table. The user opens it to answer one
question first: *what do my holdings and watchlist report this week, and how did
they do?* The page answers that last, if at all.

Research across three groups of products (calendar sites: Earnings Whispers,
Nasdaq, Yahoo, Zacks, MarketBeat; pro tools: TradingView, Koyfin, Seeking Alpha,
Finviz, Benzinga; broker apps: Earnings Hub, Robinhood, Public, Webull, eToro,
Stocktwits) agreed on a handful of patterns. Those that fit our data:

- your holdings first, with what is at stake (no broker shows position size);
- a week grid, day × session, logos ranked by size with "+N more";
- one row shape that fills in as the report lands: estimate → actual → surprise → move;
- the post-earnings price move beside the surprise (Earnings Hub sells this);
- session in words, not BMO/AMC;
- on a weekend, open on the coming week (done separately in the weekend fix).

Not feasible with our data, and out of scope: whisper numbers, implied move,
guidance, confirmed-date flags, call times and transcripts, estimate ranges and
revisions.

## Goals

1. The top of the page is the user's own names reporting in the selected week.
2. The rest of the market is still there, below, ranked by size.
3. Every reported row says how the stock reacted, with the window it measured.
4. No extra Finnhub calls: the calendar stays one call per week.

## Non-goals

- Per-symbol beat-rate history ("beat 7 of 8") on this page — it costs a Finnhub
  call per symbol; it stays on Research → Earnings.
- A multi-week season view.
- Sector grouping or market-cap filters (possible later from `ScreenerRow.sector`).

## Page layout (top to bottom)

**Header row.** Title; week navigation (← range → plus the "This week" /
"Upcoming week" reset from the weekend fix); the Mine / All toggle. The toggle
filters the grid and the day list only. The band always shows the user's names.

### 1. Your week band

- Headline tally computed from the rows tagged `mine`: "6 of yours report ·
  4 reported, 3 beat". A pending row (date passed, no actual) counts as reporting,
  not reported.
- One row per name. Order: holdings by `weight_pct` descending, then watchlist
  names by `market_cap` descending (null last, then by revenue estimate).
- Row fields: logo, ticker + company name, a Held / Watching marker; day and
  session in words; for holdings, weight of the portfolio; EPS estimate until
  reported, then actual + surprise chip; move with its basis; for holdings,
  `pnl_impact` in EUR.
- No truncation.
- Quiet week (no rows tagged mine): one line, "None of yours report this week.
  Next: AAPL, Thu 30 Oct", from `next_mine`. If `next_mine` is null, just the
  first sentence.
- Clicking a row opens `/research?symbol=<SYM>&tab=earnings`, as today.

### 2. Market line and week grid

- Market line above the grid: "412 reporting · 61% of reported beat", from
  `stats` (`beat / reported`, omitted while `reported` is 0).
- Grid: columns Mon–Fri, plus Sat/Sun only when a weekend day has events. Rows
  Before open and After close, plus one "During hours / time not set" row only
  when the week has such events.
- Each cell: a count in the corner; up to 6 logo tiles in `rankEvents` order;
  "+N more" when there are more. A reported tile has a thin edge: green beat,
  red miss, grey in line, amber pending (the existing colours).
- Clicking a cell selects that day (and scrolls the list to that session).
  Clicking a logo opens the symbol. Clicking "+N more" selects the cell.
- An empty cell is muted and shows no count.

### 3. Day list

- The selected day's events, grouped by session as today (`splitBySession`).
- Columns: Company (logo + ticker + name), Mkt cap, Qtr, EPS est → actual
  (chip), Revenue est → actual (chip), Move.
- Every column keeps its width before the report: missing values render `—`.
- Sort: `rankEvents` — mine first (held, then watched), then market cap, then
  revenue estimate.
- Default selected day: unchanged rule (today's column in the current week,
  Monday otherwise, falling back to the first busy day).

### Phone

Below `md`, the grid is replaced by a sticky strip of day chips (label + count);
then the band; then the selected day's list as one column (Company, EPS, Move).
The grid is never squeezed onto a phone.

### Kept and dropped

Kept: beat/miss/pending encoding and colours, the pending state, InfoTips that
explain the encoding, the failure card, the Mine-scope "View all →" empty state.

Dropped: the four `WeekSummary` tiles, the `DayCard` rail, the `BulletBar` "vs
est" column (the surprise chip says the same thing), the BMO/AMC/DMH abbreviations.

## Backend

### One request, enriched

`GET /api/research/earnings/calendar/?scope=&week=` stays the only request. The
Finnhub market week is cached untagged as today (`research:earnings-week:<v>:<monday>`).
Enrichment happens per request from our own tables. Bump `CACHE_V` only if the
cached shape changes; enrichment is applied after the cache, so it should not.

Each event gains:

| field | source | notes |
|---|---|---|
| `name` | `ScreenerRow.name` | null outside the S&P 500 ∪ Nasdaq-100 universe |
| `market_cap` | `ScreenerRow.market_cap` | null when unknown, never 0 |
| `sector` | `ScreenerRow.sector` | `''` → null |
| `value` | `Position.value` (EUR, already fx-converted) | holdings only |
| `weight_pct` | `Position.weight_of(get_portfolio_value())` | holdings only; null if the total is unavailable |
| `move_pct` | `research/reaction.py` | null when not computable |
| `move_basis` | `'1d'` / `'2d'` | null with `move_pct` |
| `pnl_impact` | `value × move_pct / 100`, EUR | holdings only |
| `also` | other share-class symbols merged into this event | `[]` by default |

One `ScreenerRow` query for all symbols in the week; one `Position` query.

### Price reaction — `research/reaction.py`

The only module that decides what a move means. Input: an event (date, session)
and a date-ordered list of `(date, close)`. Output: `(move_pct, basis)` or
`(None, None)`.

- `bmo` or `dmh` on D: close(D) vs close(previous session before D) → `1d`.
- `amc` on D: close(next session after D) vs close(D) → `1d`.
- No session: close(next session after D) vs close(previous session before D) → `2d`.
- "Previous / next session" means the nearest close in the list before / after
  D, so holidays and weekends are handled by the data, not a calendar.
- Any required close missing (not yet traded, outside the list, D itself not in
  the list for bmo/amc) → `(None, None)`. A zero base close → `(None, None)`.

Close sources, in order:

1. The user's names (held or watched with a uic + asset type): `market.chart()`
   daily bars, already cached per instrument. A `ProviderError` here falls through.
2. `ScreenerRow.recent_closes` for the universe.
3. Otherwise null.

Saxo being disconnected never fails the calendar.

### `ScreenerRow.recent_closes`

New `JSONField(default=list)`: the last 15 sessions as `[{"date": "YYYY-MM-DD",
"close": float}]`, oldest first, written by `scan._refresh_technicals` from the
bars it already fetches. One migration. The scan's existing fields are unchanged.
Run `manage.py migrate` on the dev database, then the next nightly scan (or the
Discover Refresh button) fills it.

### Share-class merge

Within one date, events whose `ScreenerRow.name` is identical and non-empty
merge into one event led by the held class, else the watched class, else the larger `market_cap` (tie: alphabetical symbol).
The merged-away symbols go into `also`. `held` / `watched` / `mine` are the OR of
the group; a holding's `value` and `weight_pct` are summed across the group.
No `ScreenerRow` name → no merge. The merge never guesses from ticker letters.

### Stats

`stats` becomes `{total, reported, beat, missed, inline, mine}`, computed after
the merge, over the scope's events. The week's `avg_surprise` and `by_day` are
removed: their only readers are `WeekSummary` and the day-card split in
`pages/Earnings.jsx`, both dropped. The per-symbol `avg_surprise` in the symbol
earnings score (`earnings.py`, read by Research's `EarningsTab`) is a different
field and stays.

### Next report for a quiet week

The response gains `next_mine`: `{symbol, date}` for the held position with the
soonest `ScreenerRow.next_earnings_date` after the window's end, or null. Holdings
outside the universe are skipped, not looked up.

### Dashboard

`portfolio.insights._upcoming_earnings` reads `window_earnings('mine', …)` and
only `symbol`, `date`, `held`, `eps_actual` and its existing fields. New fields
are additive; the trimmed `stats` is not read there. Its tests must stay green.

## Frontend

### Files

`pages/Earnings.jsx` becomes a thin page: fetch, `scope` / `week` / selected-day
state, layout. Components move to `components/earnings/`:

- `YourWeek.jsx` — band, headline, quiet-week line.
- `WeekGrid.jsx` — session × day grid, cells, "+N more".
- `DayStrip.jsx` — phone day chips.
- `DayList.jsx` — column header, session groups, rows.
- `EarningsCells.jsx` — `EpsCell`, `RevenueCell`, `MoveCell`, `SurpriseChip`;
  shared by band and list so a result reads the same in both.

### `lib/earnings.js`

New pure helpers, each with specs:

- `rankEvents(events)` — the single ordering used by band, grid and list.
- `buildWeekGrid(events)` — `{ days, sessions, cells[session][day] }`; the
  third session row and weekend columns only when populated.
- `sessionWords(session)` — Before open / After close / During hours / Time not set.
- `moveLabel(event)` — signed move with `1d` / `2d`, or null.
- `yourWeekTally(events)` — counts for the band headline.

Removed: the `SESSION` abbreviation map in the page and helpers only the dropped
components used (`dayDate` stays if the strip or grid uses it).

### Reused

The logo component in `components/ui.jsx` (falls back to the ticker when the
image fails), `fmtEur` for `value` / `pnl_impact`, `fmtPct`, `fmtCompact`,
`BEAT` / `MISS` / `REPORTED` / `PENDING` from `lib/charts`, `InfoTip`, `Card`,
`Pill`. Visual work goes through the `saxodash-design-system` skill, including
its screenshot-review recipe.

## Error and empty states

- Calendar `ok: false` or request error → the existing failure card.
- The nightly scan never ran → names, caps and universe moves are null; ranking
  falls back to revenue estimate; the page renders.
- Saxo disconnected → the user's moves fall back to `recent_closes`, then `—`.
- No events in a cell → muted cell, no count.
- Mine scope with an empty day → the existing "View all →" link.

## Testing (test-first)

Backend:

- `research/test_reaction.py`: each session rule and its basis; next session
  across a holiday gap; missing close → null; zero base → null; D missing from
  the list for bmo/amc → null.
- Calendar tests: enrichment from `ScreenerRow` and `Position` (value/weight for
  holdings only, nulls otherwise); move sourcing order (chart, then
  `recent_closes`, then null; chart `ProviderError` falls through); share-class
  merge (identical names only; flags OR-ed; values summed); trimmed stats;
  `next_mine`.
- Scan test: `_refresh_technicals` writes `recent_closes` (15 entries, oldest first).
- `portfolio` tests unchanged and green.

Frontend:

- `lib/earnings.test.js`: `rankEvents`, `buildWeekGrid` (third row and weekend
  columns only when populated), `sessionWords`, `moveLabel`, `yourWeekTally`.
- Component specs: `YourWeek` (held before watched, quiet-week line with and
  without `next_mine`), `WeekGrid` ("+N more", reported edges, cell click selects
  the day), `DayList` (`—` placeholders, sort).
- `pages/Earnings.test.jsx` updated: tiles gone, band present, week nav and the
  weekend label still work.

Done means: both suites and eslint green, `migrate` run on the dev DB, and a
screenshot check at desktop and phone width.

## Docs

One "Decided" paragraph in `AGENTS.md`: the page is portfolio-first; the move
rules in `reaction.py` (1d per session, 2d when the session is unknown); closes
come from Saxo charts for the user's names and the nightly scan's `recent_closes`
for the universe; share classes merge only on an identical `ScreenerRow` name.
