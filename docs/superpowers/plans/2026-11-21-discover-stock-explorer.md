# Discover stock explorer implementation plan

Based on `develop` at `7c1382a`. The [design spec](../specs/2026-11-19-automated-discover-design.md) defines the experience. The [mockup](../../mockups/automated-discover.html) demonstrates it with fictional data.

## Release outcome

A visitor can arrive without a ticker, find an unfamiliar company through a screen, explain why it appeared, open Research, save it to a chosen watchlist and resume browsing. Start on **All stocks** in Cards view. Table is a second presentation of the same results. Deliver the explorer against existing data first. The weekly shortlist follows when a published edition can substantiate its selections.

## 1. Make the browse results trustworthy

Start a feature branch from current `develop`. Write the failing API cases first. The current browse query already returns totals and facets and accepts an offset. Its opportunity order uses the user’s portfolio action before the check count, while the UI says “Most quality checks passed.” Add an explicit checks-passed sort for Discover with a stable listing tie-breaker. Preserve the existing opportunity order for callers that request it. Exercise two stocks where portfolio action and check count would put them in opposite orders. [Browse logic](../../../backend/verdicts/browse.py) · [API tests](../../../backend/verdicts/test_views.py) · [Sort labels](../../../frontend/src/lib/discoverBrowse.js)

Trace the quoted close to its trading session. The verdict writer sets `as_of` from `fundamentals_at`, even though `last_close` comes from the price series. Carry the actual session date with the close where available. Older rows with an unknown session should display “Close date unavailable.” Test a fundamentals refresh after a market holiday, a missing price and a row created before the change. Use the available sector when a verified business description is missing. [Verdict writer](../../../backend/verdicts/compute.py) · [Price calculations](../../../backend/research/technicals.py)

**Implementation decision.** Add a nullable `close_date` to `StockVerdict` with a migration. At verdict computation, take the date from the final dated entry in the screener row’s `recent_closes` when it corresponds to that row’s `last_close`. Persist the price and its date in the same verdict write, clearing the date when provenance is missing. Existing verdicts acquire the field through their next normal recomputation. Expose it on browse rows alongside the existing `as_of`, which keeps its current meaning for other clients. [Screener fields](../../../backend/research/models.py) · [Verdict model](../../../backend/verdicts/models.py) · [Compute tests](../../../backend/verdicts/test_compute.py)

## 2. Put the explorer on the default route

Change the unfiltered Discover route from stock rails to the paged result set. Keep the full-width search, desktop filters, mobile filter disclosure, existing filter URLs and scan status. Drive Cards and Table from one query. Fetch the next offset when the reader selects **Show more**. Keep the existing per-request limit and remove the 60-stock ceiling on the browsing session. Preserve the loaded results when switching layouts. Returning from Research should restore the query, screen, sort, layout and place in the results. A change to the filter set starts a fresh page sequence. [Discover page](../../../frontend/src/pages/Discover.jsx) · [Results component](../../../frontend/src/components/discover/BrowseResults.jsx)

Reuse the card’s price chart, instrument-aware Research link and watchlist star. Use the shared table primitives for the comparison view. Both views should identify what the business does, show the price context and explain the active screen in plain language. For example, a pullback result can state its decline from the one-year high alongside the quality checks it still passes. Keep the existing idea and fund entry points accessible through the transition. [Stock card](../../../frontend/src/components/discover/StockCard.jsx) · [Watchlist star](../../../frontend/src/components/discover/WatchlistStar.jsx)

**Acceptance:** Find a stock beyond result 60, change layout, open Research and return to it. Verify the same ticker, position, ordering and result count. Retry a failed second page without duplicating rows or losing the first page. Distinguish an unsuccessful scan from a successful query with zero matches. [Page tests](../../../frontend/src/pages/Discover.test.jsx)

**Navigation state.** Keep the selected screen, search, filters, sort and Cards/Table choice in Discover’s route parameters. Exclude layout from the data-query key. Use the existing 24-row page size and page by offset. Keep loaded pages in the query cache and the last visible listing and loaded depth in the Discover history entry. On Back from Research, restore the pages before restoring the scroll position. A fresh link opens at the first page. Changing screen, sort or filters resets the page sequence. Test rapid search changes so a late page from the previous query cannot append to the new one. [Query hooks](../../../frontend/src/api/queries/verdicts.js) · [URL helpers](../../../frontend/src/lib/discoverBrowse.js)

## 3. Connect screens to the full dataset

| Screen | Implementation and acceptance |
| --- | --- |
| Strong companies and price pullbacks | Reuse the existing quality and drawdown rules. Search and sector filters narrow the selected screen. The reason on the card must agree with the underlying figures. |
| More screens | Reuse the server’s shelf rules before filtering, counting, sorting and paging. The shelf preview caps its cards at 20. A matching company outside that preview must still be searchable. |
| Fund buying | Use the existing reported-quarter aggregation, restricted to covered listings. Carry the quarter and number of tracked funds that opened or increased a position into the explanation. Verify a qualifying stock beyond the investor hub’s 12-item preview. |
| Saved stocks | Resolve membership from the signed-in user’s named watchlists. Saving to two lists yields one result. Removing one membership keeps the result visible. Removing the last one removes it from this screen. Verify isolation with two users and the empty state with zero memberships. |

Use one screen chooser on phones. Preserve existing shelf deep links. Check the result count and facets against the same screen membership, including when the eligible set is empty. [Shelf rules](../../../backend/research/shelves.py) · [Fund aggregation](../../../backend/investors/signals.py) · [Current rail callers](../../../frontend/src/components/discover/StockRails.jsx)

**API contract.** Extend `GET /api/verdicts/browse/` with one optional `screen`. Accept `all`, `strong`, `pullbacks`, `fund-buying`, `saved` and existing shelf keys. Discover sends `sort=checks` for its default view. Existing requests without these parameters retain their behavior. Use `fall` as the pullback screen’s initial sort and add a `funds` sort on the number of tracked buyers in the disclosed quarter. Keep unknown figures last and use ticker as the final tie-breaker within the current US universe. Reject unknown screen or sort keys. Preserve the response’s `stocks`, `total` and `facets`; add the applicable reason fields from the shelf or fund calculation for the selected screen. Both layouts consume those same fields. [Browse view](../../../backend/verdicts/views.py) · [URL registration](../../../backend/verdicts/urls.py)

**Membership and updates.** Use the existing covered browse universe and intersect it with the chosen screen on the server. For fund buying, reuse the hub’s disclosed-quarter selection and minimum of three tracked buyers before applying any preview limit. For Saved stocks, join the signed-in user’s watchlist items by instrument identity. An empty eligible set returns zero rows and zero matches. After a successful membership or list deletion, invalidate the affected saved-screen queries as well as the watchlist cache. A failed toggle retains the last confirmed membership and allows retry. Test removing the last membership from the table while the star menu is open, including where keyboard focus lands when the row disappears. [Investor rules](../../../backend/investors/signals.py) · [Watchlist mutations](../../../frontend/src/api/queries/research.js) · [Star tests](../../../frontend/src/components/discover/WatchlistStar.test.jsx)

## 4. Validate the investor workflow and merge

Run the affected Django API and Vitest tests, frontend lint and the production build. On a phone and desktop, use a keyboard or touch to find a company, toggle one named watchlist, dismiss the menu, and reopen it from Research. Verify persistence after reload, feedback on a failed save and the existing path to create a first watchlist. Open the PR into `develop` and require green CI.

Run these targeted checks during implementation, followed by the repository’s complete [CI suite](../../../.github/workflows/ci.yml).

| Directory | Command |
| --- | --- |
| `backend/` | `python manage.py test verdicts.test_views verdicts.test_compute research.test_technicals research.test_shelves` |
| `backend/` | `python manage.py makemigrations --check --dry-run` |
| `frontend/` | `npx vitest run src/pages/Discover.test.jsx src/lib/discoverBrowse.test.js src/components/discover/WatchlistStar.test.jsx` |
| `frontend/` | `npx eslint .` and `npm run build` |

For a beginner walkthrough, give the participant no ticker and ask, “Find a company you want to understand better. What caught your attention, and what would you check before buying?” Observe which screen they choose, whether they can explain one figure, and whether they can return to the company they saved. In particular, listen for anyone reading “below usual P/E” as proof of fair value. Use that observation to refine the copy.

## Frontend integration decisions

Discover uses the application's theme tokens, stock cards, table density, segmented controls and watchlist overlay. At phone widths the existing navigation supplies the visible page title. Sort shares the filter disclosure, leaving the stock screen and Cards/Table controls visible above the results. A browser walkthrough of the production build at 375 px placed the first stock about 295 px from the top with the disclosure closed. This measurement used fixture data.

A watchlist row exposes its checked state to assistive technology. If removing the final membership makes the active company disappear from Saved stocks, keyboard focus returns to the results region. The screen picker requests only shelf definitions and scan health. Complete shelf membership is queried when the visitor selects a screen.

## Follow-on decision for the weekly shortlist

**Pilot budget.** Use existing access and free sources at €0 incremental cost. Run a private evidence check before adding a provider integration.

1. Freeze a small sample of U.S. operating companies from the current universe before looking at their ranks. Record the edition cutoff, listing, currency, dated close and available Finnhub inputs. Use the cached daily bars where available. The scanner records a fundamentals refresh time and fiscal periods, so verifying when a statement became public requires separate evidence. [Scanner](../../../backend/research/scan.py)
2. Cross-check the figures used in each case against its public filing. SEC submissions and Company Facts are available without an API key. Use the filing available at the cutoff and retain its accession and acceptance time. Record missing fields and ambiguous listing matches as exclusions. [SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
3. Run the proposed rules twice against the frozen inputs. Review a qualifying case and a near miss if available, plus how much of the sample could actually be evaluated. Let a complete run return zero. Ask a beginner to explain the reason a company surfaced and one reason to pass.
4. Before a shared beta, verify listing lookup and dated closes without Saxo and check the feed's terms for the intended audience. If free coverage falls short, narrow the supported universe or keep the pilot private. Record the specific gap before considering any paid source.

The explorer can ship independently. First pilot the independent listing and price source and reproduce one edition from inputs available on its publication date. Then connect the compact shortlist entry, two featured briefs and the full comparison to actual published data. Exercise zero, two and five candidates plus a failed refresh. The latter keeps the previous edition and its date visible. Evaluate comprehension and repeat use separately from any claim about investment returns. [Selection and rollout spec](../specs/2026-11-19-automated-discover-design.md)
