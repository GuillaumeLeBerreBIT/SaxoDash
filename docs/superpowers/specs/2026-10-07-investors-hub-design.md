# Investors hub (TrueWallet-style) — design

Sub-project 1 of 3. Follows `2026-10-04-famous-investors-design.md` (Phases 1–2 merged) and
replaces its unbuilt Phases 3–4.

## Purpose

`/investors` works but feels empty (19 funds) and has no structure: a toolbar, a card grid and one
snapshot panel. The goal is the browsing experience of TrueWallet / Autopilot, built on the 13F
data the app already imports:

- a **front page that says what is happening** (shelves of cross-fund signals),
- **many more portfolios**, grouped by investing style,
- a **portfolio-story profile** per investor: who they are, what they just did, what they hold,
- the ability to **follow** investors and to **add any 13F filer**.

Success: opening `/investors` answers "what are the tracked investors buying and selling this
quarter?" without a click, and any of ~80 funds is two clicks away.

### The TrueWallet structure this mirrors

| TrueWallet | Here |
|---|---|
| Browse portfolio cards by category | Hub shelves + directory with style chips |
| Follow a portfolio | `followed` flag, Following shelf, ★ on the profile |
| "Explains each move in plain words" | Latest moves on the profile |
| Convergent signals across portfolios | Convergent buys / Most sold shelves, Stocks table |
| Portfolio page: identity → moves → holdings | Profile single scroll in that order |
| Backtest with disclosure delay | **Sub-project 3**; cards and profile reserve the slot |
| New-trade alerts | **Sub-project 2** |
| Politicians, AI wallets, copy trading | Out of scope |

## Decisions taken in brainstorming

- Hub layout: **Discover-style shelves**, directory last. The Stocks table is the "see all" of the
  signal shelves.
- Profile layout: **single-scroll portfolio story**, not tabs.
- Coverage: **curated ~80 with style tags, plus Add investor** by EDGAR search.
- Cross-fund data: a **materialized `PositionMove` table rebuilt on import**.
- Follow ships here (one boolean; the app is single-user). Alerts do not.
- Avatars are initials. No headshots.
- Visual language is the existing design system (`docs/design-system.md`). The Apple-style
  restyle is a separate later project.

## Backend

### Models (one migration; run `manage.py migrate` on the dev DB)

`Investor` gains:

- `styles`: `JSONField(default=list)`, values from `STYLES = Value, Growth, Activist, Macro, Tech,
  Concentrated, Contrarian, Quant`.
- `followed`: `BooleanField(default=False)`.

`curated` keeps its meaning (came from `curated.csv`). Search-added investors are `curated=False`.

New `PositionMove`:

| Field | Notes |
|---|---|
| `investor` | FK, cascade |
| `quarter_end` | date |
| `cusip`, `put_call` | same identity as `Holding` |
| `kind` | `new`, `added`, `trimmed`, `unchanged`, `sold_out` (constants from `changes.py`) |
| `shares`, `previous_shares` | `previous_shares` null for `new`; `shares` 0 for `sold_out` |
| `value`, `previous_value` | dollars, as normalised by the importer |
| `weight_pct` | share of that investor's quarter total; 0 for `sold_out` |
| `change_pct` | share change %, null when not computable |

Unique on `(investor, quarter_end, cusip, put_call)`. Indexes on `(quarter_end, kind)` and `cusip`.
The investor's first stored quarter has no comparison: its rows are written with `kind` null and
are excluded from every signal.

### `investors/moves.py` — the only writer of `PositionMove`

Interface: `rebuild(investor)` and `rebuild_all()`.

- Reads `quarters.effective_filings`, so amendments stay a read-time rule and stored filings are
  never rewritten. `PositionMove` is a derived cache, safe to drop and regenerate.
- Classifies with `changes.position_change` / `changes.compare`. No second definition of "added".
- Replaces all of one investor's rows in a single transaction.
- Called by `importer.sync_investor` whenever it stored at least one filing. Management command
  `rebuild_moves` calls `rebuild_all()`; the migration is followed by one run of it.

Tickers are not stored on a move. They are joined from `Security` at read time, because CUSIP
resolution can complete after the import.

### `investors/signals.py` — the read side

- `signal_quarter()`: the newest `quarter_end` that at least half of tracked investors have filed,
  else the previous one. Returns the quarter plus `filed` and `tracked` counts. This keeps a shelf
  from reading "bought by 2 funds" on day 3 of a filing window.
- Shelves are declarative rules (same shape as `research/shelves.py`): key, title, kind
  (`investors` or `stocks`), a query, and the `see_all` target.

| Key | Kind | Rule |
|---|---|---|
| `following` | investors | `followed=True`, newest filing first |
| `convergent-buys` | stocks | ≥3 distinct investors with `new` or `added` on a cusip in the signal quarter; ranked by investor count, then summed value increase |
| `most-sold` | stocks | `trimmed` or `sold_out`, ranked by investor count, then summed value decrease |
| `new-bets` | stocks | `new` rows ranked by `weight_pct` in that investor's portfolio; each item names the investor |
| `just-filed` | investors | latest `filed_on`, newest first |

Rows with `put_call != ''` are excluded from every stock shelf. A stock item carries ticker (or
issuer when unresolved), issuer, counts, and up to five investor slugs/names for the avatar stack.

- `stock_activity(quarter, view)`: one row per cusip with `owners`, `bought`, `sold`, `new`,
  total value; `view` ∈ `bought`, `sold`, `owned`, `new` picks the sort and the non-zero filter.

### `summaries.py`

- `card()` reads its counts and top holding from `PositionMove` instead of rebuilding two
  snapshots per investor. Adds `styles` and `followed`.
- `detail()` adds `styles`, `followed`, `blurb`, `top5_weight`, `sectors` (existing
  `sectors.sector_for`, weight per sector, unknown grouped as "Other") and `moves`: the quarter's
  non-`unchanged` moves ordered new → added → trimmed → sold out, each by weight or previous weight.
- `changes_payload()` reads the same rows, so card, profile and changes cannot disagree.

### Coverage

- `curated.csv` gains a `styles` column (`|`-separated) and filled `blurb`s, and grows to ~80
  managers (Dataroma-style superinvestor list; every CIK verified against EDGAR when added).
- `load_investors` upserts name, firm, blurb and styles by CIK; existing history is untouched.
  New rows go through the existing `backfill_investors`.
- `edgar.search_filers(query)`: EDGAR company search restricted to 13F filers
  (`/cgi-bin/browse-edgar?action=getcompany&company=…&type=13F-HR&output=atom`, verified live
  2026-10-07: returns matching names and CIKs). Paced by the existing `_pace()`.
- Add: creates the `Investor` (`curated=False`, slug from firm name, never one of the reserved
  slugs `hub`, `stocks`, `search`) and queues the existing backfill; progress uses the existing
  import-progress payload.
- Stop tracking: deletes a non-curated investor with its filings and moves. A curated investor
  answers 409 — `load_investors` would re-create it, so it can only be unfollowed.

### API (`/api/investors/…`, JWT)

| Endpoint | Answer |
|---|---|
| `GET hub/` | `{quarter, filed, tracked, shelves: [{key, title, kind, total, items[≤12]}]}`; empty shelves omitted |
| `GET stocks/?view=&quarter=` | `{quarter, quarters, view, rows}`; 400 on an unknown view |
| `GET /?holds=&style=` | directory cards |
| `GET <slug>/?quarter=` | detail as above |
| `PATCH <slug>/` | `{followed: bool}` → updated card |
| `GET search/?q=` | `[{name, cik, tracked}]`; throttle scope `investors.search` (10/min); EDGAR failure → 502 with a message |
| `POST /` | `{cik}` → 201 card; 409 if already tracked |
| `DELETE <slug>/` | 204; 409 for curated |
| `GET <slug>/changes/` | unchanged contract |

`hub/`, `stocks/` and `search/` are routed before `<slug>/`.

## Frontend

### Routes

- `/investors` — hub
- `/investors/stocks?view=bought|sold|owned|new&quarter=` — Stocks table
- `/investors/:slug?quarter=` — profile

### Hub (`pages/Investors.jsx`)

Top to bottom:

1. Header: "Investors · N tracked · signals for Q2 2026 · 61 of 82 filed" and an **Add investor**
   button.
2. Shelves in the order the API returns them. Each is a titled horizontal row with "See all"
   (stock shelves → `/investors/stocks?view=…`; investor shelves scroll to the directory with the
   matching filter).
3. **All investors** directory: style chips (All, Following, each style, Stopped filing), search
   (investor, firm or ticker — existing `holds` behaviour), sort, Cards/Table toggle. Chip, sort
   and layout live in the URL.

`InvestorCard`: initials avatar, name, firm, style chips, portfolio value, top holding with
weight, quarter move counts (`+3 new · 2 sold`), filed date, ★ toggle, and a reserved line for
"return since filing" that renders nothing until sub-project 3 supplies it. The whole card links
to the profile.

`StockSignalCard`: logo (`lib/logos.js`), ticker, issuer, the signal sentence ("7 funds bought",
"New 9% position · Ackman"), avatar stack. Links to Research for a resolved ticker.

The snapshot panel and the `?investor=` param are removed.

### Stocks table (`pages/InvestorStocks.jsx`)

View tabs (Most bought, Most sold, Most owned, New positions), quarter picker, table: stock,
owners, bought, sold, new, total value, held-by avatar stack. Paginated client-side with the
existing `PAGE_SIZE` / `PAGE_STEP`.

### Profile (`pages/Investor.jsx`)

Single scroll:

1. `InvestorHero`: avatar, name, firm, style chips, blurb, quarter picker, ★ Follow, and Stop
   tracking for non-curated investors (confirm first). Stale notice as today.
2. Stat tiles: portfolio value, positions, top-5 weight, filed date, and the reserved return slot.
3. `LatestMoves`: one sentence per move, grouped New / Added / Trimmed / Sold out, first 8 with
   "Show all N". Wording comes from `lib/investorHub.js`.
4. `ConcentrationPanel`: top holdings (existing `TopHoldings` bars) beside sector weights.
5. All holdings: the existing `HoldingsTab`.
6. `LimitsNote`, unchanged.

`ChangesTab` is retired in favour of Latest moves; `ImportProgress` moves from `SnapshotPanel`
into its own file.

### Modules

- `lib/investorHub.js` (pure, tested): move sentences, style filtering/sorting, shelf "see all"
  targets, initials.
- `api/client/investors.js` + `api/queries/investors.js`: `useInvestorHub`, `useInvestorStocks`,
  `useInvestorSearch`, `useFollowInvestor`, `useAddInvestor`, `useStopTracking`.
- `components/investors/`: `Shelf` (reuse Discover's shelf primitive if it is generic; otherwise
  extract one shared primitive rather than a second copy), `InvestorCard`, `StockSignalCard`,
  `InvestorDirectory`, `AddInvestorDialog`, `InvestorHero`, `LatestMoves`, `ConcentrationPanel`,
  `InvestorAvatar`, `StyleChips`.

### React rules applied (`vercel-react-best-practices`, client-side subset)

- One `hub/` request for all shelves; hub and directory queries start in parallel — no waterfall.
- Follow is an optimistic mutation that patches the hub, list and detail caches and rolls back
  on error.
- Filtered/sorted lists are derived during render from data + URL params; no effect-synced state.
- `content-visibility: auto` on directory cards.
- Profile query prefetched on card hover/focus.
- No components defined inside components; conditional rendering by ternary.

## Errors and edge cases

- Hub before any import, or with every shelf empty: header plus the directory and a one-line note;
  never a column of empty shelves.
- Signal quarter older than the newest filing quarter: header says which quarter the signals
  describe and how many have filed the newer one.
- Unresolved CUSIP: show the issuer name; no Research link.
- Investor with one stored quarter: no moves, Latest moves says there is nothing to compare yet.
- Amendment arriving later: importer triggers `moves.rebuild`, so signals follow.
- EDGAR search failure: inline message in the dialog; the page is unaffected.
- Adding an already-tracked CIK: 409, the dialog links to that investor.
- Follow failing: star rolls back, toast with the error.

## Testing

- `moves.rebuild`: new/added/trimmed/sold-out/unchanged rows, first-quarter rows, options kept
  apart, an amendment changing the result, idempotent re-run.
- `signals`: the half-filed quarter rule both ways; each shelf rule incl. the ≥3 threshold and
  option exclusion; `stock_activity` per view.
- `APITestCase` per endpoint, incl. reserved-slug routing, curated delete 409, duplicate add 409,
  search with EDGAR mocked (success and failure).
- `load_investors` upserting styles/blurb without touching history.
- vitest: `lib/investorHub.js`, hub (shelves, hidden empty shelf, chips in URL, optimistic
  follow), Stocks page, profile (moves, concentration, stop tracking), Add dialog.
- Screenshot review with the `saxodash-design-system` harness before merge.

## Build phases (each its own plan section and review)

1. **Moves layer:** model + migration, `moves.py`, importer hook, `rebuild_moves`, `summaries`
   reading from it. No visible change; existing API tests stay green.
2. **Coverage:** `styles`/`followed`, CSV to ~80 with styles and blurbs, `load_investors` upsert,
   backfill run.
3. **Signals API:** `signals.py`, `hub/`, `stocks/`, follow `PATCH`, detail additions.
4. **Hub + Stocks pages.**
5. **Profile story.**
6. **Add investor / Stop tracking** (search endpoint, dialog).

## Out of scope

- Copy-after-filing performance and backtests (sub-project 3).
- New-filing alerts and badges (sub-project 2).
- Politicians, AI wallets, copy trading or any order placement.
- Per-holding history, "Overlap with you", Research "Held by" card.
- The Apple-style visual restyle.
