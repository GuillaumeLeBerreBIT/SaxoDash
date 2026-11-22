# Automated Discover

**Status** — Explorer layout approved for development. The shortlist pilot has a €0 incremental market-data budget. Provider coverage and numerical selection rules still need validation.
**Design preview** — [Interactive mockup](../../mockups/automated-discover.html)

[Stock explorer implementation plan](../plans/2026-11-21-discover-stock-explorer.md)

## Product decision

Discover should automatically surface a small number of long-term growth candidates and explain why each is worth investigating at the latest verified price. A beginner can read the shortlist and open its evidence without connecting Saxo, importing holdings, or writing a thesis. Existing app authentication may remain for the first release.

The first release covers **growth at a reasonable price** in the supported U.S. universe. A separate quality-revisit shortlist can follow once this workflow is useful and measurable. The horizon is five years as a shared research assumption. The weekly publication cadence gives readers time to review results without encouraging daily trading.

## Experience

- **Weekly shortlist** opens on demand from a compact entry with the candidate count beside the explorer heading. The explorer uses the full result area on desktop and mobile. Show up to two briefs. Give each the same space. Start with the business and listing, then a one-sentence account of what changed, two dated or period-labelled figures, a specific risk, the closing price and a **Read the case** link. Chart bars use a shared zero baseline within each brief. When more qualify, show “Showing 2 of N companies” and “See all N companies.” The complete edition lists every candidate with its business, dated close, valuation context, reason it surfaced and one question to investigate. Every row opens Research and uses the explorer’s watchlist picker. Returning restores the explorer selection. Keep coverage and edition changes in a disclosure.
- **Stock explorer** opens on all stocks in the covered index. Show a result count, a readable first page and a control to load more. Give visitors one screen at a time, with common screens visible and other ideas grouped by watchlists, business and valuation, price and trading, and upcoming earnings. Keep the native single-choice picker on phones. Cards initially show the business, dated close, recent weekly prices and why the stock fits the screen. Table supports denser comparison. Switching layout preserves the search, screen, filters, sort and loaded count. Every stock opens in Research and can be saved in either view.
- **Watchlist star** reuses the existing Discover interaction in Cards, Table, Research and the full weekly shortlist. The star opens an anchored menu headed by the ticker. Each row shows a named watchlist, a visible membership checkbox and the number of stocks in that list. Selecting a row immediately adds or removes the stock in that list. The menu stays open for further selections. An outside click, a second click on the star or Escape dismisses it. The star is filled while the stock belongs to any list. **Saved stocks** includes stocks in any list. The preview stores example lists locally. Production uses the existing per-user watchlists.
- **Evidence** is a deep-linkable candidate view. Show the supporting figures, their source and availability date, and the downside, base and upside assumptions. Link to the relevant figures or filings in Research. Expand the scenario inputs on demand.
- **What changed** explains additions and removals against the prior edition. For a removal, distinguish deteriorating fundamentals, price moving beyond the rule, data becoming unavailable, and a candidate losing its place to higher-ranked alternatives.
- **Search and filters** start with a full-width index search. Show valuation, quality, sector, yield, drawdown and portfolio filters in a desktop sidebar and a disclosure on smaller screens. Search and filters narrow the selected screen. Sorting applies to the whole matching set before pagination. Reset restores the entire index. The market scope accompanies the edition date.
- A completed run with qualified coverage and zero picks shows **No candidates met the criteria**. A failed or incomplete refresh shows **This week’s shortlist is delayed** and can link to the dated prior edition. An initial run without a previous edition has its own empty state. Status and evidence use readable text as well as color.

The mockup uses fictional companies and figures. It shows two featured briefs, a five-company shortlist and a searchable 18-stock sample index with Cards and Table views on one Discover page in the Republic theme, plus filtered results, evidence, the Research handoff, and a completed week with no candidates.

## First release on the existing data

1. Open Discover on **All stocks**. Use the existing browse endpoint for both Cards and Table, search across the entire covered set, and page using its offset. The current results component stops at 60 even when more stocks match. Preserve the loaded page, sort, screen and filters when switching layout or returning from Research. [Browse implementation](../../../backend/verdicts/browse.py) · [Current results](../../../frontend/src/components/discover/BrowseResults.jsx)
2. Reuse the stock card’s Research destination and per-user watchlist action in both layouts. Compose each explanation from the selected screen and available fields. Verify how the close date is sourced before displaying it. The preview’s company descriptions, prices and weekly closes are fixtures. [Stock card](../../../frontend/src/components/discover/StockCard.jsx)
3. Check that each sort label matches the server order. The current “Most quality checks passed” option orders by portfolio action first. Test with two companies whose action rank and checks rank disagree. For an idea screen, apply its full membership before search, filtering, sorting and pagination. The Discover homepage receives only a preview of each shelf. [Sort labels](../../../frontend/src/lib/discoverBrowse.js) · [Server order](../../../backend/verdicts/browse.py) · [Shelf membership](../../../backend/research/shelves.py)
4. Verify the release with a company outside the shortlist. Find it by name, narrow the results, switch layouts, open Research, save it, and return to the same results. Also exercise an empty search, missing figures, and a result beyond row 60. Introduce the weekly shortlist entry when a reproducible edition can supply its count, evidence and publication date.

## Selection method

1. **Establish the universe.** Begin with the current U.S. universe as a starting list. Publish actual coverage and exclusions. Limit the first screen to operating companies with usable financial history. Exclude banks, insurers, funds and securities without an unambiguous match. Broader mid-cap coverage is the next universe experiment if the launch list mostly surfaces familiar names.
2. **Gate on data quality.** Require a verified listing, fresh end-of-day price, sufficient consecutive statements, known public availability dates, and compatible share and currency bases. Validate price adjustment conventions. Use timestamped provider observations and preserve unknowns. Exclude affected candidates when inputs fail. Define coverage and freshness thresholds in configuration, version them, and calibrate them on real source data before launch.
3. **Screen for durable growth.** Reuse validated revenue growth, cash generation and balance-sheet fields from Discover where their definitions fit. Treat exceptional gains, dilution, recent margin deterioration and missing years as evidence to surface or eligibility issues. Calibrate a small, inspectable set of gates on a representative sample with explicit reasons. Avoid a single opaque score.
4. **Evaluate today’s price.** Translate five-year per-share cash generation and a documented exit multiple into downside, base and upside scenarios. Each calculation must use the same listing currency and share basis. Show assumed growth and exit multiple and whether distributions are included. A case that requires multiple expansion or optimistic growth to pass stays out. Define and version the base-case hurdle and downside limit before publication. Historical P/E can provide context only where reliable.
5. **Rank and explain.** Rank eligible cases by base-case attractiveness subject to the downside gate, then evidence completeness and a stable listing identifier. Publish up to five, with at most one per issuer. Derive the explanation from the same inputs and rules. A price or filing event is shown only if verified. Otherwise say why the company meets the current screen.

## Architecture

- Keep the first implementation in `backend/research` alongside the scanner and screens, with UI in Discover and direct Research links. Reuse existing fundamentals, listing resolution, watchlists and Celery conventions where they satisfy the new data contracts.
- Start the private pilot with available scanner snapshots and free public filings. For a broker-independent release, verify that a free source supplies listing lookup and daily prices with adequate coverage, rate limits and display rights. Record any shortfall for a later decision.
- Store a distinct issuer and listing reference with exchange, symbol, currency and provider IDs. Associate every output with the exact listing used. Optional logos resolve through verified identity and fall back to initials.
- Refresh input data on trading days and publish a versioned edition weekly. Record edition time, market, rule version, universe membership, coverage, candidate inputs, rejection reasons, and data provenance. A retry must be idempotent. Publish a fully assembled edition atomically and retain the previous published snapshot. User page loads read the stored edition without triggering a provider scan.
- Store enough point-in-time inputs to reproduce what readers saw, including candidates that were later removed or delisted. Avoid retroactively rewriting prior editions. Corrected editions should disclose their revision.

## Validation and rollout

| Phase | Deliverable | Exit check |
| --- | --- | --- |
| Data pilot | Independent listing and daily-price feed plus defensible fundamentals for a sample | An unconnected user opens the right listing. Cross-source fixtures cover same ticker on different exchanges, an ADR, stale and missing data, a split and an unreleased quarter. |
| Private beta | One automated weekly shortlist, evidence details, and edition history | A failed publication preserves the prior edition. A fully evaluated empty edition is distinguishable from a provider failure. Unchanged inputs yield the same ordering. Every displayed claim resolves to evidence. |
| Evaluate | Beginner walkthroughs and forward observation | Users can identify why a stock surfaced and give a reason to pass. Track evidence opens and repeat visits. Freeze selection ahead of evaluation, compare against a broad benchmark and a simple quality screen, and document dividends, costs, delistings, coverage, and uncertainty. |

An early beta can establish comprehension and reliability. Investment performance needs a longer observation period with point-in-time data. Launch copy should describe research candidates and scenario assumptions.

## Expansion and open decisions

- Choose the provider, supported universe, numerical screen thresholds, and publication schedule after the data pilot. Those are product decisions based on observable coverage and quality.
- Pilot one European exchange before adding a regional shortlist. Preserve exchange-level identity while making a market the top-level visitor choice. Apply the same evidence bar with local reporting and calendar conventions.
- Saxo portfolio context, manual entry and XLSX can add exposure awareness later. Dedicated quality-revisit screens, alerts, advanced chart parity, and a notebook are separate follow-on work.
