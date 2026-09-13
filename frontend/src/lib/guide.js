/** Static reference content for the Research Guide tab: what each metric
 *  measures and what counts as good/ok/caution. Numbers are pulled from the
 *  same threshold constants the verdicts elsewhere on Research use, so this
 *  copy can't drift from what the badges and quadrant actually do. */

import { ACCEL_THRESHOLD_PP, EPS_GAP_THRESHOLD_PP, MARGIN_MOVE_THRESHOLD_PP } from './earningsInsights'
import { T } from './snapshot'

export const SNAPSHOT_GUIDE = [
  {
    key: 'growth',
    label: 'Growth',
    meaning: 'TTM year-over-year revenue and EPS growth, plus 5-year revenue growth for trend.',
    read: `Above ${T.revFast}% revenue growth is fast, ${T.revSteady}–${T.revFast}% is steady, 0–${T.revSteady}% is modest, and negative is contracting. EPS growth beating revenue growth by more than ${T.epsGap} points suggests margins are expanding; lagging by more than ${T.epsGap} points suggests margins are under pressure.`,
  },
  {
    key: 'profitability',
    label: 'Profitability',
    meaning: 'Return on equity and margins - how much profit the business turns its equity and sales into.',
    read: `ROE above ${T.roeStrong}% and net margin above ${T.marginStrong}% together read as highly profitable. ROE above ${T.roeOk}% or margin above ${T.marginOk}% alone still reads as profitable. Below both, margins are thin or negative.`,
  },
  {
    key: 'health',
    label: 'Financial health',
    meaning: 'Leverage and liquidity - whether the company can cover its debts and near-term obligations.',
    read: `Debt/equity above ${T.deHigh}, a current ratio below ${T.currLow}, or interest coverage below ${T.coverLow}x flags leverage or liquidity risk. Debt/equity below ${T.deLow} with a current ratio above ${T.currStrong} reads as conservative. Anything in between is adequate.`,
  },
  {
    key: 'valuation',
    label: 'Valuation',
    meaning: "PEG (P/E relative to growth) and P/E measured against the stock's own multi-year range.",
    read: `PEG below ${T.pegCheap} looks cheap relative to earnings growth, above ${T.pegRich} looks expensive, and in between is fairly priced. A P/E more than ${Math.round(T.histBand * 100)}% above its own historical median reads as rich versus its own history; that much below reads as cheap versus its own history.`,
  },
  {
    key: 'momentum',
    label: 'Momentum',
    meaning: 'Price trend over the past year and year-to-date.',
    read: `More than +${T.momUp}% over 1 year is up; below ${T.momDown}% is down; anything between is roughly flat. A negative YTD alongside a positive 1-year return is called out separately as "lagging YTD."`,
  },
]

export const RATIO_GUIDE = [
  {
    label: 'Market',
    metrics: [
      { name: 'Market cap', text: "Price × shares outstanding - the market's size tag for the company. No good/bad on its own; it mainly sets expectations for volatility and liquidity, since mega-caps tend to move less per headline than small-caps." },
      { name: 'Dividend yield', text: 'Annual dividend ÷ price. A rising yield can mean a healthier payout, or it can mean the price has fallen - check which before treating a high yield as a buy signal.' },
      { name: '52W range', text: "Today's price against its own 12-month low and high - a quick read on where sentiment currently sits, not a valuation judgment by itself." },
      { name: 'Dividend growth (5Y)', text: "Whether the payout has been raised over 5 years - a proxy for management's confidence in durable cash flow." },
    ],
  },
  {
    label: 'Valuation multiples',
    metrics: [
      { name: 'P/E, Forward P/E, PEG', text: 'PEG and P/E vs. own history are covered under Valuation above. A Forward P/E notably below trailing P/E usually signals expected earnings growth.' },
      { name: 'P/S', text: 'Price per dollar of revenue - useful for growth companies not yet profitable; only compare it within the same industry.' },
      { name: 'P/B', text: 'Price relative to book value - most meaningful for asset-heavy businesses like banks and insurers; less useful for asset-light software companies.' },
      { name: 'EV/EBITDA', text: "Enterprise value to EBITDA - like P/E but capital-structure neutral, so it's the fairer way to compare companies carrying different amounts of debt." },
      { name: 'EV/Revenue', text: 'Like P/S but debt-neutral - used the same way, for growth or unprofitable names.' },
      { name: 'Beta', text: '1 moves with the market, above 1 amplifies its swings, below 1 dampens them - a read on how much the stock moves versus the market, not on the business itself.' },
    ],
  },
  {
    label: 'Profitability & health',
    metrics: [
      { name: 'ROA', text: "Profit per dollar of total assets - how efficiently the balance sheet is used. ROE can look great from leverage alone; ROA won't." },
      { name: 'ROI', text: 'Return on all invested capital, debt plus equity - the profitability ratio least distorted by how the business happens to be financed.' },
      { name: 'Gross margin', text: 'Revenue left after direct costs of goods or services - the ceiling every other margin is carved out of.' },
      { name: 'Current ratio', text: 'Current assets ÷ current liabilities - the same short-term coverage read as Financial health above.' },
    ],
  },
]

export const QUADRANT_GUIDE = {
  meaning: 'Two 0-100 scores plotted against each other: quality averages ROE, net margin, and inverted leverage bands; valuation is primarily PEG, nudged by P/E versus its own history. Same thresholds as Snapshot and Ratios, just combined into one picture.',
  corners: [
    { label: 'High quality, cheap (top-left)', text: 'A good business at a reasonable price - the rare combination worth digging into further.' },
    { label: 'High quality, expensive (top-right)', text: 'The market already knows it’s good. It has to keep delivering to justify the price; a stumble is expensive here.' },
    { label: 'Low quality, cheap (bottom-left)', text: "Classic value-trap territory - it's cheap for a reason. Confirm the reason before buying, don't assume it away." },
    { label: 'Low quality, expensive (bottom-right)', text: 'Paying up for a weak business - avoid by default unless something else in the story overrides it.' },
  ],
}

export const EARNINGS_GUIDE = [
  { name: 'Surprise bars', text: 'Actual vs. estimated EPS each quarter - one beat or miss is noise; a repeated pattern across several quarters says more.' },
  { name: 'Revenue growth trend', text: `A year-over-year revenue-per-share growth swing of more than ${ACCEL_THRESHOLD_PP} points versus the prior quarter is flagged as accelerating or decelerating.` },
  { name: 'EPS vs. revenue gap', text: `EPS growth beating revenue-per-share growth by more than ${EPS_GAP_THRESHOLD_PP} points is flagged as margin expansion; lagging by that much is flagged as margin pressure.` },
  { name: 'Margin move', text: `A year-over-year move of more than ${MARGIN_MOVE_THRESHOLD_PP} point in operating margin (or net margin, when operating isn't available) is flagged as expansion or contraction.` },
]

export const PLAYBOOKS = [
  'Fast revenue growth, EPS outpacing revenue, a cheap PEG, and a conservative balance sheet together are a strong candidate worth a closer look.',
  'A rich PEG paired with decelerating revenue growth means the stock is priced for perfection - a single soft quarter can hurt it.',
  "A cheap valuation next to weak profitability or financial health can be a value trap - find out why it's cheap before buying, not after.",
  'Top-right of the quadrant, high quality and high valuation, is a good business you’d already have to pay up for - fine to own, but with less margin of safety.',
  'Consistent EPS beats alongside accelerating revenue growth is momentum backed by fundamentals, not just price action.',
  'Strong 1-year price momentum without matching strength in Snapshot or Ratios means the price may be ahead of the fundamentals - worth double-checking before chasing it.',
]
