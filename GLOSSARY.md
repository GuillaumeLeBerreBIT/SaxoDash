# SaxoDash

A personal finance dashboard for one owner and invited users: investments at Saxo, research on US stocks, what tracked funds and Congress members trade, and the owner's bank accounts at KBC and Argenta, in one place.

## Language

### Portfolio

**Instrument**:
One tradable listing at Saxo, identified by its uic and asset type. Two instruments can share a ticker (a US stock and an unrelated European listing), so a ticker alone never identifies one.
_Avoid_: Symbol (when the exact listing matters), security

**Position**:
What the user holds of one Instrument at Saxo right now: shares, average price paid, value and result.
_Avoid_: Holding (fine in page copy such as "Your holdings", but the stored concept is Position)

**Portfolio Value**:
The value Saxo reports for the user's account, in euros. The app never recomputes it from its own prices.
_Avoid_: Net worth (that is the Money page's total, which adds bank and hand-entered accounts)

**Weight**:
A Position's share of the Portfolio Value. A stock that is not held has no Weight, which is different from a Weight of zero.

**Weight Cap**:
The user's own concentration rule: no single stock above 15% of the Portfolio Value. Going over it is what makes the Action Trim.
_Avoid_: Limit, max position

**Watchlist**:
A named list of Instruments the user follows without holding them. There is one set of watchlists per user, shared by Research, Charts and Boards.

### Verdict

**Universe**:
The index stocks the nightly Scan covers and Discover shows. Stocks a user holds or watches outside it are scanned as Extras, but never appear in Discover.

**Extra**:
A US stock outside the Universe that is scanned because a user holds or watches it. Only that user sees its Verdict and Signals.

**Scan**:
The nightly pass that stores each stock's fundamentals, P/E history and daily bars, which every Verdict and Signal is computed from.

**Verdict**:
The app's rule-based reading of one stock: its Quality Grade, its Valuation Grade and the levels behind them. It is the same for every user.

**Quality Check**:
One of seven tests of the business (such as return on equity, debt, growth, and whether profit arrives as cash). A missing figure counts as unknown, never as a pass.

**Quality Grade**:
Strong, mixed or weak, from how many Quality Checks pass, or unknown when too few could be answered.

**Valuation Grade**:
Where today's P/E sits against the stock's own five-year range: below, within or above its usual P/E. It describes the price and never judges it.
_Avoid_: Cheap, expensive (as a recommendation)

**Action**:
What the Verdict means for one user, given their Weight: Passes quality screen, Hold, Trim or Review. Two users can see different Actions for the same stock.
_Avoid_: Buy, Add, Sell (old names; the app never tells the user to buy or sell)

**Review**:
The Action for a stock whose Quality Grade is weak: read the story again before deciding. A falling price alone never leads to Review.
_Avoid_: Sell, sell signal

**Call**:
The record opened when a stock first passes the quality screen, with the price on that day, so the rules can later be judged against the index.

**Track Record**:
How the Calls have done since they were opened, measured against the S&P 500. There is no backtest, because past Verdicts would use figures nobody had at the time.

### Charts

**Charts**:
The page for analysing price: one, two or four Panes with drawing tools and Guides.
_Avoid_: Advanced View (the old name)

**Pane**:
One chart inside Charts. Linked panes share the symbol, range and crosshair.

**Range**:
The preset span a chart shows: 1W, 1M, 3M, 6M, 1Y or ALL.
_Avoid_: Time Window (that is what is actually visible after panning and zooming)

**Time Window**:
The days a chart shows right now: picked by the Range, then moved by panning and zooming. It always lies inside the history the chart has loaded.
_Avoid_: Range, viewport

**Compare**:
A Pane mode that shows how the stock moved against up to five other lines (the S&P 500, its Sector Fund and stocks the user adds), each as the % change from the first day of the Time Window.
_Avoid_: Overlay, benchmark view, Compare page (the old idea of a separate page)

**Guide**:
A layer the app draws on the candles from its own data: the Cheap and Expensive Zones, the 52-week high, Volume Gaps and the Stop-loss. Each can be switched on or off.
_Avoid_: Indicator (RSI, MACD and moving averages), overlay

**Cheap Zone / Expensive Zone**:
The bands on the candles where the stock's P/E would be below its usual range (green, below the cheap line) or above it (red, above the expensive line), using the earnings known at each date. Always named in full, never just "zone".
_Avoid_: Zone (on its own), P/E band, value zone

**Volume Gap**:
A day that opens more than 4% away from the previous close on more than twice the usual volume, drawn as a box until the price trades back through the gap.

**Drawing**:
A shape the user places on a chart themselves: a Horizontal Line, a Trend Line or a Zone.
_Avoid_: Annotation (in page copy), study

**Zone**:
A user-drawn rectangle between a low and a high price, over a span of days, usually to mark support or resistance.
_Avoid_: Box, rectangle, support zone

**Stop-loss**:
The price at which the user plans to sell to cap a loss: their own figure from their note, or else two average daily ranges below the last close.
_Avoid_: Stop (in copy shown to users)

**Trade Plan**:
Arithmetic on the user's own figures: the Stop-loss, the reward against the risk, and how many shares would lose a chosen share of the portfolio at the Stop-loss. It is never a prediction or a suggestion.

### Signals

**Signal**:
A named price pattern, such as a gap up on heavy volume, an RSI below 30 or a golden cross, tested on the app's own 23 years of daily bars.
_Avoid_: Setup (that is the card that lists them), trigger

**Signal Grade**:
How a Signal did in testing, over the 60 sessions after it fired, against the average stock on the same days: Held up in testing, Cannot be judged fairly, No edge found, Worked against, or Too few cases.
_Avoid_: Bullish, bearish, strength

**Cannot Be Judged Fairly**:
The grade for a Signal that buys a falling price and looked good in testing. The test only knows today's index members, which flatters such a Signal, so it is never graded as Held up.

### Discover, Research and Boards

**Shelf**:
A ready-made list of stocks around one idea, such as fell hard but still strong, or funds are buying.
_Avoid_: Lens (fine in conversation), screen, list

**Daily Brief**:
Overview's short list of up to five things to look at in the portfolio today, computed from today's state rather than from what changed since yesterday.
_Avoid_: Alerts, notifications

**Board**:
A user-arranged grid of Panels for keeping an eye on many things at once, saved in the browser.
_Avoid_: Dashboard (that is Overview), workspace

**Panel**:
One tile on a Board, such as a watchlist, a price chart, news or the sector money flow.
_Avoid_: Widget, card (a card is a block on an ordinary page)

**Followed Symbol**:
The one stock a Board is looking at. Picking a stock in its watchlist moves it, and every linked Panel follows.

**Sector**:
One of the 11 standard sectors a stock in the Universe belongs to, such as Information Technology or Health Care.
_Avoid_: Industry (the narrower label from the data provider)

**Sector Move**:
The equal-weight average move of a Sector's stocks in the Universe over a day or a month, using the Sector's members of today.
_Avoid_: Sector performance, money flow (fine as the Panel's name)

**Sector Fund**:
The SPDR fund that tracks one Sector, such as XLK for Information Technology. It is weighted by company size, so it can move differently from the Sector Move, and it is always named by its ticker, never as "the Sector".
_Avoid_: Sector (on its own, for the fund), sector index, sector ETF (fine in conversation)

### Investors and Congress

**Tracked Fund**:
One of the large investors whose quarterly 13F filings the app reads, shown as a person or a firm.
_Avoid_: Smart money (fine as a heading), guru, whale

**Filing Quarter**:
The calendar quarter a 13F filing reports. Funds file up to 45 days after it ends, so what they bought is already old news for them.

**Convergent Buy**:
A stock that several Tracked Funds bought in the same Filing Quarter.

**Copy Performance**:
What holding a Tracked Fund's 20 largest disclosed stocks, from the first session after each filing until the next, would have returned against the S&P 500.

**Congress Member**:
A member of the US House of Representatives whose disclosed stock trades the app reads.

**House Trade**:
One disclosed purchase or sale by a Congress Member, reported as an amount range and filed weeks after the trade.
_Avoid_: Insider trade (that is a company insider's filing)

### Money and banking

**Bank Transaction**:
A single booked (settled, not pending) line on a KBC or Argenta account. Distinct from a Transaction, which is Saxo trade and cash activity only.
_Avoid_: Transaction (without qualifier, when bank data is meant), Activity

**Category**:
A label on a Bank Transaction saying what kind of spending or income it is (such as Groceries, Subscriptions or Utilities). It is assigned by a rule on the merchant or description, unless a Category Override exists.
_Avoid_: Type, Tag (Type is already used for account type, e.g. "Current account")

**Category Override**:
A Category the user picked by hand for one Bank Transaction. It always wins over the rule, and a later sync never replaces it.

**Subscription**:
A group of Bank Transactions from the same merchant, at a similar amount, recurring on a roughly regular cadence (weekly, monthly or yearly). The user can confirm or dismiss it.
_Avoid_: Recurring payment (fine in conversation, but the stored concept is Subscription)

**Spending**:
Net outflow from Bank Transactions over a stated period, grouped by Category: debits minus any Refund/Credit that nets against the same Category, leaving out Transfers and savings. A Spending figure without a period is a bug.
_Avoid_: Cash flow (reserved for the Saxo deposits, dividends and fees chart)

**Own Account**:
A KBC or Argenta account the user has connected, as opposed to any other account a Bank Transaction might mention.

**Transfer**:
Money moved between the user's own accounts rather than spent: a Bank Transaction matched by amount and date to one on another Own Account, or a payment to one of a few accounts the user has confirmed as their own or their household's. Left out of Spending, but shown as its own line.

**Refund/Credit**:
An incoming Bank Transaction that is neither a Transfer nor income. When it matches an earlier payment's merchant it nets against that Category; otherwise it is counted on its own.
