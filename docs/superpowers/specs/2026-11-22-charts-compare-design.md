# Compare on Charts

Settled in a grilling session on 2026-11-22 (twenty questions, all agreed). Mockup:
https://claude.ai/artifact/5WixUZvoXsqoJdBNSSn5oS (private to the owner).

## Problem Statement

On Charts I can see how a stock moved, but not whether that move was special. A stock up 18% over
six months looks strong until I notice the S&P 500 rose 6% and its own Sector 9% in the same
days. Today I have to open other symbols in other Panes and do the sums in my head, and the
Panes use different price scales, so the comparison is never fair at a glance.

## Solution

A **Compare** toggle on each Charts Pane. When it is on, the Pane shows the stock and up to five
other lines, each as the % change from the first day of the Time Window, so every line starts at
0% on the left edge and their ends can be read side by side.

The S&P 500 and the stock's own Sector are one click away; any other symbol Charts can open can
be added with "Add symbol" (up to three). A legend shows each line's % on the hovered day, and
one plain sentence under the chart states where each line ended. The stock itself can be shown
as candles (the default) or a line; on candles my Zones, Drawings and Guides stay where they
belong. Everything about Compare is remembered per Pane in this browser.

## User Stories

1. As an investor, I want a Compare toggle on a Charts Pane, so that I can judge a stock's move against something else without leaving the chart.
2. As an investor, I want every line to start at 0% on the first visible day, so that lines with very different prices can be compared fairly.
3. As an investor, I want the lines to restart at 0% whenever I change the Range, pan or zoom, so that the numbers always describe exactly the days I am looking at.
4. As an investor, I want the S&P 500 as a one-click line, so that I can see at once whether the stock beat the market.
5. As an investor, I want the stock's own Sector as a one-click line, so that I can tell a stock-specific move from a sector-wide one.
6. As an investor, I want the S&P 500 and Sector buttons to start off, so that turning Compare on does not clutter the chart before I choose.
7. As an investor, I want the Sector line to follow the same equal-weight rule as Sector Move on Boards, so that the app never shows two disagreeing numbers for "the Sector".
8. As an investor, I want the Sector line's tooltip to say it is the equal-weight average of today's members, so that I know companies that left the Sector are not in it.
9. As an investor, I want to add up to three more symbols with "Add symbol", so that I can compare a stock with its direct peers.
10. As an investor, I want "Add symbol" to find anything Charts can open, stocks and ETFs alike, so that I can compare with a peer outside the Universe or with a sector fund.
11. As an investor, I want "Add symbol" to show how many slots are left, so that I know when I have reached the limit.
12. As an investor, I want "Add symbol" to refuse a symbol already on the chart, so that I never end up with two identical lines.
13. As an investor, I want the S&P 500 button hidden when the stock is SPY itself, so that I am not offered a comparison with itself.
14. As an investor, I want the Sector button hidden for a stock or ETF that has no Sector, so that I am never offered an empty line.
15. As an investor, I want a line whose history starts inside my Time Window to begin on its first trading day at its own 0%, labelled "from <date>", so that a recent listing is still visible and its shorter span is obvious.
16. As an investor, I want to switch the main stock between Candles and Line while comparing, so that I can keep the candle detail or get a cleaner picture as I prefer.
17. As an investor, I want Candles to be the default in Compare, so that the chart keeps looking like Charts when I turn Compare on.
18. As an investor, I want the candles in Compare to keep their shape and only change the axis to %, so that I lose none of the price action.
19. As an investor, I want my Zones, Drawings and Guides to stay in the right place on the candles while comparing, so that my support and resistance stay in view.
20. As an investor, I want Zones, Drawings and Guides hidden when the main stock is a line, so that the clean view stays clean.
21. As an investor, I want the drawing tools greyed out while Compare is on, with a hint to leave Compare to draw, so that I never place a drawing on a % axis by accident.
22. As an investor, I want the volume, RSI and MACD panes to stay as they are while comparing, so that the main stock's indicators remain available.
23. As an investor, I want a legend in the top-left with each line's colour, name and % change, so that I can read the lines without guessing.
24. As an investor, I want the legend to show the % for the day under my cursor, and the last visible day when I am not hovering, so that I can read any day exactly.
25. As an investor, I want to click a line's name in the legend to hide or show it, so that I can focus on two lines without losing the others.
26. As an investor, I want an × beside an added symbol to remove it, so that I can free a slot.
27. As an investor, I want one plain sentence under the chart saying where each line ended over the window, so that I get the answer without reading the chart.
28. As an investor, I want that sentence to state facts only, never a judgement, so that the app stays non-advisory.
29. As an investor, I want the sentence to update as I pan and zoom, so that it always matches the chart.
30. As an investor, I want each Pane to have its own Compare setting even when Panes are linked, so that I can compare in one Pane and keep plain candles in another on the same stock.
31. As an investor, I want each Pane's Compare state, lines and Line/Candles choice remembered in this browser, so that the chart looks the same when I come back.
32. As an investor on a phone, I want Compare to work the same way, with the legend wrapping onto rows and "Add symbol" opening the symbol search full screen, so that I can compare on the go.
33. As an investor, I want lines to be told apart by lightness as well as hue, so that the chart stays readable for colour-blind viewers and in both themes.
34. As an investor, I want a clear empty or error state when a compared line cannot load, so that one failed symbol does not break the whole Pane.

## Implementation Decisions

- **Where it lives:** Compare is a per-Pane mode on Charts only. Research's chart and Boards
  Panels do not get it. The idea of a separate Compare page is dropped.
- **Rebasing rule:** each line's value on a day is its close divided by its close on the first
  visible day of the Time Window, minus one, as a percentage. A line whose history starts later
  rebases on its own first day inside the window. Candles rebase their open, high, low and close
  by the main stock's first visible close, which is a pure rescale, so price-anchored Zones,
  Drawings and Guides are drawn by applying the same factor.
- **One pure frontend helper module** owns the Compare maths: rebasing a set of series to a
  first visible date, aligning series on dates (a compared line takes the main stock's trading
  days; a missing day is a gap, not a zero), marking a late start with its first date, reading
  each line's value at a hovered date, and composing the fact sentence. The Pane and legend only
  render what it returns.
- **S&P 500 and added symbols** load through the existing chart data path for an instrument (the
  same request Charts already makes per Pane), so they share its caching and throttling. The
  S&P 500 is the SPY instrument already used by the analytics benchmarks.
- **Sector line, new backend endpoint:** a read-only research endpoint returns one Sector's
  day-by-day Sector Move as a series of dates and index values, built from the stored daily
  history of the Sector's current Universe members. Each day's move is the equal-weight average
  of the daily returns of members that have a close on that day and the day before; the series
  chains those moves into an index. A member counts from the day its history starts. The endpoint
  takes the Sector name and how many days of history to return, reads stored rows only (no
  provider call), and returns 404 for an unknown Sector. Its cost (up to about seventy members'
  history per request) is measured during the build; caching is added only if the measurement
  calls for it.
- **Which Sector:** the stock's Sector comes from its Universe row. No row, no Sector button.
- **Persistence:** the existing per-browser chart workspace record gains, per Pane slot, the
  Compare on/off flag, the chosen suggestions (S&P 500, Sector), the added symbols (symbol, uic,
  asset type) and the Line/Candles choice. Reading an older record without these fields yields
  Compare off. No database change.
- **Limits:** at most the main stock plus five lines: the two suggestions and three added
  symbols. Duplicates of any symbol already on the chart are refused in the search.
- **Drawing tools:** disabled for the Pane while Compare is on, with a title telling the user to
  leave Compare to draw. Existing drawings are shown read-only on candles and hidden on line.
- **Colours:** compared lines use chart colours from the theme, distinct in lightness as well as
  hue, in both themes; no new palette literals.
- **Glossary:** `GLOSSARY.md` gains **Compare**; **Sector Move** now covers the day-by-day line
  and the "today's members" rule.

## Testing Decisions

- A good test checks what a user or API caller sees: the numbers on the legend and sentence, the
  buttons offered, the response body. It never asserts on internal state, hook calls or markup
  structure that a refactor could change without changing behaviour.
- **Backend, the Sector endpoint:** an `APITestCase` next to the existing Sectors view tests.
  Cases: equal-weight chaining over two members with different prices; a member whose history
  starts later only counts from its first day; a day where a member has no bar is skipped for
  that member; an unknown Sector answers 404; the endpoint needs authentication.
- **Frontend, the Compare helper:** vitest unit tests beside it, in the style of the existing
  growth helper's benchmark rebasing tests. Cases: every line is 0% on the first visible day;
  moving the first visible day rebases; a late-starting line begins at its own 0% with its first
  date; a missing day is a gap; the hovered value falls back to the last visible day; the
  sentence lists only visible lines and states rises and falls without judgement.
- **Frontend, the Charts page:** extend the existing Charts page tests with the API stubbed.
  Cases: turning Compare on offers S&P 500 and Sector, both off; SPY hides the S&P 500 button; a
  stock without a Sector hides the Sector button; adding a fourth symbol is refused and a
  duplicate is refused; removing an added symbol frees its slot; Line hides drawings, Candles
  shows them; drawing tools are disabled while comparing; Compare state survives a remount
  through the stored workspace; linked Panes keep separate Compare states.
- **Workspace storage:** extend the existing chart workspace sanitising tests so a stored record
  with the new fields round-trips and an old record reads as Compare off.

## Out of Scope

- Compare on Research's chart or as a Boards Panel.
- A separate Compare page.
- Indexes other than the S&P 500 as one-click suggestions (Nasdaq 100 and the world index can be
  added through "Add symbol" via their ETFs).
- Sector ETFs as the Sector line.
- Drawing new Zones or Drawings while Compare is on.
- Saving Compare setups to the database or sharing them across devices.
- Survivorship-free Sector history (past members of a Sector are not stored).
- Alerts on compared lines.

## Further Notes

- Saxo serves the compared symbols' daily bars with 15-minute delayed prices, like the rest of
  Charts.
- Daily bars are mostly split-adjusted; a few stored unadjusted splits (noted in the chart value
  guides work) would show as a jump in a Sector line or a compared stock.
- The owner's standing rule for chart features applies: visual, on the candles, simple, and
  never two readings that disagree.
