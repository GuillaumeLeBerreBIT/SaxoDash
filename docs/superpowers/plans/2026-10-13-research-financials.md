# Research Financials, Statistics and Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup the Research page's tabs so every figure has one home, add a Financials tab backed by a new statements endpoint, turn Valuation into Statistics with ratio history, and enrich Overview and Earnings.

**Architecture:** One new backend module, `research/statements.py`, maps Finnhub's `/stock/financials-reported` XBRL rows onto a fixed row set and serves them through `GET /api/research/statements/<symbol>/` under the existing fundamentals contract. The fundamentals payload gains a few profile fields, the recommendation history and a by-year ratio table. On the frontend, pure logic lives in `lib/statements.js`; each new card is its own component in `components/research/`; `pages/Research.jsx` only changes its tab list and wiring.

**Tech Stack:** Django + DRF (`APITestCase`, `TestCase`), Finnhub free tier, React 19, Recharts, Tailwind, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-12-research-depth-design.md` (section "Phase 2").

## Global Constraints

- Generated code carries zero comments and zero docstrings. Tool directives (`# noqa`, `// eslint-disable-next-line`) are the only exception. Leave existing comments as they are.
- No new dependency, backend or frontend. No second data provider.
- Chart colours come from `frontend/src/lib/charts.js`. No hex literal in a new component; add a named export to `lib/charts.js` when a new colour role is needed.
- Type sizes use the `--fig-*` scale (`text-[var(--fig-xs)]` etc.); chart heights use `--chart-h-sm|md|lg`.
- The statements endpoint follows the fundamentals contract: always HTTP 200 with an `available` boolean, 24h cache, `research.fundamentals` throttle scope. Never a 409 (that means "not connected to Saxo").
- A row or metric the provider does not return is omitted, never zero-filled or guessed.
- An ETF gets no company blocks: Financials, Statistics, Peers and Earnings are `equityOnly`.
- `?tab=valuation` keeps working as an alias for `?tab=statistics`.
- The forecast cone is out of scope. Do not build analyst-target or own-target projections.
- Test-first: write the failing test, see it fail, then implement. Backend tests run with `python manage.py test research` from `backend/`; frontend with `npx vitest run <path>` from `frontend/`.
- Work only in the worktree `.worktrees/research-depth` on branch `feat/research-financials`. Never `git stash`. Commit after each task; do not push.
- Pages mock `../api/queries` wholesale (`vi.mock('../api/queries')`), so every new hook a page reaches must be stubbed in that page's test setup.

## Facts about the provider (probed 2026-10-13 on AAPL, NOW, JPM, KO, NVDA)

- `/stock/financials-reported` returns `{'data': [entry, ...]}` newest first. An entry has `year`, `quarter` (0 for a 10-K), `form`, `startDate`, `endDate`, `filedDate` (all `'YYYY-MM-DD HH:MM:SS'`) and `report: {'ic': [...], 'bs': [...], 'cf': [...]}`. Each row is `{'concept', 'unit', 'label', 'value'}`.
- Concepts carry a `us-gaap_` prefix in recent filings and **no prefix** in filings before about 2014 (`Revenues`, `NetIncomeLoss`). Company extensions keep their own prefix (`jpm_TradingAssets`).
- A 10-Q's income and cash-flow figures are **year-to-date**: `startDate` is the fiscal year start, and AAPL's Q2 revenue is Q1 + Q2. There is no Q4 report. The two newest quarters usually have an empty `bs`.
- `year` is the fiscal year (NVDA's quarter ending 2026-07-26 is fiscal 2027, quarter 2).
- A bank has no `GrossProfit` or `OperatingIncomeLoss`, and reports revenue as `RevenuesNetOfInterestExpense`.
- `/stock/metric` `series.annual` values are fractions for margins and returns (`grossMargin: 0.4691`), while the TTM `metric` block is in percent (`grossMarginTTM: 48.65`). `metric.enterpriseValue` is in millions.
- `/stock/recommendation` returns only the last four months. `/calendar/earnings` returns up to three upcoming quarters, not sorted oldest first.
- `/stock/profile2` has `floatingShare` (millions of shares), `ipo`, `weburl`, `country`.

## Review Focus

1. A company with no gross profit or operating income (a bank): those rows and chart series are absent, the waterfall goes from revenue straight to net income, and nothing prints a zero.
2. A fiscal year that is not the calendar year: labels and the year-on-year comparison use `fiscal_year` and `quarter`, never the calendar date.
3. A fiscal year with a missing 10-Q: the quarter after the gap is dropped instead of being computed from the wrong base, and its year-on-year change is blank.
4. Losses and negative bases: a change from a negative figure divides by its absolute value, and waterfall bars below zero stay inside the track.
5. Statements unavailable (foreign filer, Finnhub down, key missing): the Financials tab says so, while Overview, Statistics and the chart page's panel still render what fundamentals give them.

## File Structure

Backend (`backend/research/`):
- Create `statements.py`: concept mapping, annual and quarterly shaping, cached `statements(symbol)`.
- Create `test_statements_shaping.py`, `test_statements_orchestration.py`.
- Modify `finnhub.py`: profile fields, `recommendation_history`, `ratio_history`, `CACHE_V`.
- Modify `earnings.py`: `upcoming` list.
- Modify `views.py`, `urls.py`: `StatementsView`.
- Modify `test_fundamentals_shaping.py`, `test_views.py`, `test_earnings_shaping.py`.

Frontend (`frontend/src/`):
- Modify `api/client/research.js`, `api/queries/research.js`: `getStatements`, `useStatements`.
- Create `lib/statements.js` (+ test): row definitions, period helpers, change, formatting, chart rows, waterfall steps.
- Modify `lib/charts.js`: `STATEMENT_SERIES`.
- Modify `lib/analystRating.js`: export `ANALYST_GRADES`.
- Create in `components/research/` (each with a test): `FinancialsChart.jsx`, `StatementTable.jsx`, `ProfitWaterfall.jsx`, `FinancialsTab.jsx`, `RatioHistoryTable.jsx`, `RatioHistoryChart.jsx`, `KeyFactsStrip.jsx`, `OwnershipCard.jsx`, `CapitalStructureCard.jsx`, `AnalystRatingCard.jsx`, `AnalystCounts.jsx`, `MiniFinancials.jsx`.
- Rename `ValuationTab.jsx` to `StatisticsTab.jsx` (and its test).
- Modify `OverviewTab.jsx`, `EarningsTab.jsx`, `EpsBarChart.jsx`, `SymbolPanel.jsx`, `pages/Research.jsx`, and their tests.

---

### Task 1: Statement shaping (backend, pure)

**Files:**
- Create: `backend/research/statements.py`
- Test: `backend/research/test_statements_shaping.py`

**Interfaces:**
- Produces: `statements.to_annual(reported) -> list[dict]` and `statements.to_quarterly(reported, annual_rows) -> list[dict]`. Both return rows oldest first. A row is `{'period': 'YYYY-MM-DD', 'fiscal_year': int, 'label': str, 'income': dict, 'balance': dict, 'cash_flow': dict}`; a quarterly row also has `'quarter': 1..4`. Statement dicts hold only the keys that were found.
- Row keys. Income: `revenue`, `cost_of_revenue`, `gross_profit`, `research_development`, `selling_general_admin`, `operating_income`, `pretax_income`, `income_tax`, `net_income`, and (annual only) `eps_diluted`, `diluted_shares`. Balance: `cash`, `short_term_investments`, `receivables`, `inventory`, `current_assets`, `property_plant_equipment`, `goodwill`, `total_assets`, `accounts_payable`, `current_liabilities`, `long_term_debt`, `total_debt`, `total_liabilities`, `equity`. Cash flow: `operating_cash_flow`, `capital_expenditure`, `free_cash_flow`, `depreciation_amortization`, `stock_based_compensation`, `investing_cash_flow`, `financing_cash_flow`, `dividends_paid`, `share_repurchases`.

- [ ] **Step 1: Write the failing tests**

Create `backend/research/test_statements_shaping.py`:

```python
from django.test import SimpleTestCase

from . import statements


def rows(**concepts):
    return [{'concept': concept, 'unit': 'usd', 'label': concept, 'value': value} for concept, value in concepts.items()]


def filing(year, quarter, start, end, form=None, filed=None, ic=None, bs=None, cf=None):
    return {
        'year': year,
        'quarter': quarter,
        'form': form or ('10-K' if quarter == 0 else '10-Q'),
        'startDate': f'{start} 00:00:00',
        'endDate': f'{end} 00:00:00',
        'filedDate': f'{filed or end} 00:00:00',
        'report': {'ic': ic or [], 'bs': bs or [], 'cf': cf or []},
    }


def annual(year, **income):
    return filing(year, 0, f'{year}-01-01', f'{year}-12-31', ic=rows(**income))


class AnnualShapingTest(SimpleTestCase):
    def test_maps_prefixed_concepts_onto_standard_rows(self):
        reported = {'data': [filing(
            2025, 0, '2025-01-01', '2025-12-31',
            ic=rows(**{
                'us-gaap_Revenues': 1000, 'us-gaap_CostOfRevenue': 400, 'us-gaap_GrossProfit': 600,
                'us-gaap_OperatingIncomeLoss': 300, 'us-gaap_NetIncomeLoss': 200,
                'us-gaap_EarningsPerShareDiluted': 2.5,
            }),
            bs=rows(**{'us-gaap_Assets': 5000, 'us-gaap_StockholdersEquity': 2000}),
            cf=rows(**{'us-gaap_NetCashProvidedByUsedInOperatingActivities': 350}),
        )]}

        [row] = statements.to_annual(reported)

        self.assertEqual(row['period'], '2025-12-31')
        self.assertEqual(row['fiscal_year'], 2025)
        self.assertEqual(row['label'], 'FY 2025')
        self.assertEqual(row['income']['revenue'], 1000)
        self.assertEqual(row['income']['gross_profit'], 600)
        self.assertEqual(row['income']['eps_diluted'], 2.5)
        self.assertEqual(row['balance'], {'total_assets': 5000, 'equity': 2000})
        self.assertEqual(row['cash_flow'], {'operating_cash_flow': 350})

    def test_reads_concepts_without_the_us_gaap_prefix(self):
        [row] = statements.to_annual({'data': [annual(2012, Revenues=900, NetIncomeLoss=90)]})

        self.assertEqual(row['income'], {'revenue': 900, 'net_income': 90})

    def test_falls_back_through_the_revenue_candidates(self):
        [contract] = statements.to_annual({'data': [annual(
            2020, **{'us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax': 700})]})
        [bank] = statements.to_annual({'data': [annual(2020, **{'us-gaap_RevenuesNetOfInterestExpense': 800})]})

        self.assertEqual(contract['income']['revenue'], 700)
        self.assertEqual(bank['income']['revenue'], 800)

    def test_ignores_a_company_extension_concept(self):
        [row] = statements.to_annual({'data': [annual(2020, jpm_Revenues=5, **{'us-gaap_NetIncomeLoss': 10})]})

        self.assertEqual(row['income'], {'net_income': 10})

    def test_derives_gross_profit_when_only_revenue_and_cost_are_reported(self):
        [row] = statements.to_annual({'data': [annual(
            2020, **{'us-gaap_Revenues': 1000, 'us-gaap_CostOfGoodsAndServicesSold': 350})]})

        self.assertEqual(row['income']['gross_profit'], 650)

    def test_sums_selling_and_general_expense_when_reported_separately(self):
        [row] = statements.to_annual({'data': [annual(2020, **{
            'us-gaap_SellingAndMarketingExpense': 120, 'us-gaap_GeneralAndAdministrativeExpense': 80})]})

        self.assertEqual(row['income']['selling_general_admin'], 200)

    def test_omits_a_row_the_company_does_not_report(self):
        [row] = statements.to_annual({'data': [annual(
            2020, **{'us-gaap_RevenuesNetOfInterestExpense': 800, 'us-gaap_NetIncomeLoss': 100})]})

        self.assertNotIn('gross_profit', row['income'])
        self.assertNotIn('operating_income', row['income'])

    def test_ignores_a_value_that_is_not_a_number(self):
        reported = {'data': [filing(2020, 0, '2020-01-01', '2020-12-31', ic=[
            {'concept': 'us-gaap_Revenues', 'value': 'N/A'},
            {'concept': 'us-gaap_NetIncomeLoss', 'value': None},
            {'concept': 'us-gaap_GrossProfit', 'value': 10},
        ])]}

        [row] = statements.to_annual(reported)

        self.assertEqual(row['income'], {'gross_profit': 10})

    def test_derives_balance_and_cash_flow_figures(self):
        reported = {'data': [filing(
            2020, 0, '2020-01-01', '2020-12-31',
            bs=rows(**{
                'us-gaap_LiabilitiesAndStockholdersEquity': 9000,
                'us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest': 4000,
                'us-gaap_StockholdersEquity': 3900,
                'us-gaap_CommercialPaper': 100, 'us-gaap_LongTermDebtCurrent': 200,
                'us-gaap_LongTermDebtNoncurrent': 700,
            }),
            cf=rows(**{
                'us-gaap_NetCashProvidedByUsedInOperatingActivities': 500,
                'us-gaap_PaymentsToAcquireProductiveAssets': 120,
            }),
        )]}

        [row] = statements.to_annual(reported)

        self.assertEqual(row['balance']['total_liabilities'], 5000)
        self.assertEqual(row['balance']['total_debt'], 1000)
        self.assertEqual(row['balance']['long_term_debt'], 700)
        self.assertEqual(row['cash_flow']['capital_expenditure'], 120)
        self.assertEqual(row['cash_flow']['free_cash_flow'], 380)

    def test_keeps_annual_reports_only_oldest_first(self):
        reported = {'data': [
            annual(2025, **{'us-gaap_Revenues': 3}),
            filing(2025, 2, '2025-01-01', '2025-06-30', ic=rows(**{'us-gaap_Revenues': 1})),
            annual(2024, **{'us-gaap_Revenues': 2}),
        ]}

        self.assertEqual([row['fiscal_year'] for row in statements.to_annual(reported)], [2024, 2025])

    def test_an_amended_year_takes_the_latest_filing(self):
        first = filing(2024, 0, '2024-01-01', '2024-12-31', filed='2025-02-01', ic=rows(**{'us-gaap_Revenues': 10}))
        amended = filing(2024, 0, '2024-01-01', '2024-12-31', filed='2025-06-01', ic=rows(**{'us-gaap_Revenues': 12}))

        [row] = statements.to_annual({'data': [first, amended]})

        self.assertEqual(row['income']['revenue'], 12)

    def test_a_filing_with_no_recognised_row_is_left_out(self):
        reported = {'data': [filing(2020, 0, '2020-01-01', '2020-12-31', ic=rows(**{'ifrs-full_Revenue': 10}))]}

        self.assertEqual(statements.to_annual(reported), [])

    def test_survives_an_empty_or_missing_payload(self):
        self.assertEqual(statements.to_annual(None), [])
        self.assertEqual(statements.to_annual({}), [])
        self.assertEqual(statements.to_annual({'data': [{'form': '10-K'}]}), [])


def ytd(year, quarter, end, revenue, cash=None, operating=None, capex=None, bs=None):
    cf = {}
    if operating is not None:
        cf['us-gaap_NetCashProvidedByUsedInOperatingActivities'] = operating
    if capex is not None:
        cf['us-gaap_PaymentsToAcquirePropertyPlantAndEquipment'] = capex
    return filing(
        year, quarter, f'{year}-01-01', end,
        ic=rows(**{'us-gaap_Revenues': revenue, 'us-gaap_EarningsPerShareDiluted': 9.9}),
        bs=rows(**bs) if bs else [],
        cf=rows(**cf),
    )


class QuarterlyShapingTest(SimpleTestCase):
    def setUp(self):
        self.annual_filing = filing(
            2025, 0, '2025-01-01', '2025-12-31',
            ic=rows(**{'us-gaap_Revenues': 1000, 'us-gaap_EarningsPerShareDiluted': 4.0}),
            bs=rows(**{'us-gaap_Assets': 7000}),
            cf=rows(**{
                'us-gaap_NetCashProvidedByUsedInOperatingActivities': 400,
                'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment': 100,
            }),
        )
        self.annual_rows = statements.to_annual({'data': [self.annual_filing]})

    def quarterly(self, *filings):
        return statements.to_quarterly({'data': list(filings)}, self.annual_rows)

    def test_turns_year_to_date_figures_into_single_quarters(self):
        result = self.quarterly(
            ytd(2025, 3, '2025-09-30', 720, operating=290, capex=70),
            ytd(2025, 2, '2025-06-30', 450, operating=180, capex=40),
            ytd(2025, 1, '2025-03-31', 200, operating=80, capex=20, bs={'us-gaap_Assets': 6000}),
        )

        self.assertEqual([row['label'] for row in result], ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'])
        self.assertEqual([row['income']['revenue'] for row in result], [200, 250, 270, 280])
        self.assertEqual([row['cash_flow']['free_cash_flow'] for row in result], [60, 80, 80, 80])
        self.assertEqual([row['quarter'] for row in result], [1, 2, 3, 4])

    def test_the_fourth_quarter_takes_the_annual_period_and_balance_sheet(self):
        result = self.quarterly(
            ytd(2025, 3, '2025-09-30', 720),
            ytd(2025, 2, '2025-06-30', 450),
            ytd(2025, 1, '2025-03-31', 200),
        )

        self.assertEqual(result[-1]['period'], '2025-12-31')
        self.assertEqual(result[-1]['balance'], {'total_assets': 7000})

    def test_a_quarter_filed_without_a_balance_sheet_has_an_empty_one(self):
        [row] = self.quarterly(ytd(2025, 1, '2025-03-31', 200))

        self.assertEqual(row['balance'], {})

    def test_leaves_per_share_figures_out_of_quarters(self):
        result = self.quarterly(
            ytd(2025, 3, '2025-09-30', 720),
            ytd(2025, 2, '2025-06-30', 450),
            ytd(2025, 1, '2025-03-31', 200),
        )

        for row in result:
            self.assertNotIn('eps_diluted', row['income'])

    def test_a_quarter_after_a_missing_filing_is_dropped(self):
        result = self.quarterly(
            ytd(2025, 3, '2025-09-30', 720),
            ytd(2025, 1, '2025-03-31', 200),
        )

        self.assertEqual([row['label'] for row in result], ['Q1 2025', 'Q4 2025'])
        self.assertEqual(result[-1]['income']['revenue'], 280)

    def test_a_filing_that_already_covers_one_quarter_is_not_subtracted(self):
        single = filing(2025, 2, '2025-04-01', '2025-06-30', ic=rows(**{'us-gaap_Revenues': 250}))

        result = self.quarterly(
            ytd(2025, 3, '2025-09-30', 720),
            single,
            ytd(2025, 1, '2025-03-31', 200),
        )

        self.assertEqual([row['income']['revenue'] for row in result], [200, 250, 270, 280])

    def test_no_fourth_quarter_without_the_annual_report(self):
        result = statements.to_quarterly({'data': [
            ytd(2026, 1, '2026-03-31', 300),
        ]}, self.annual_rows)

        self.assertEqual([row['label'] for row in result], ['Q1 2026'])

    def test_uses_the_fiscal_year_in_the_label(self):
        fiscal = filing(2027, 1, '2026-01-26', '2026-04-26', ic=rows(**{'us-gaap_Revenues': 44}))

        [row] = statements.to_quarterly({'data': [fiscal]}, [])

        self.assertEqual(row['label'], 'Q1 2027')
        self.assertEqual(row['fiscal_year'], 2027)

    def test_keeps_the_newest_twelve_quarters(self):
        filings = [
            ytd(year, quarter, f'{year}-{quarter * 3:02d}-28', quarter * 100)
            for year in range(2019, 2025)
            for quarter in (1, 2, 3)
        ]

        result = statements.to_quarterly({'data': filings}, [])

        self.assertEqual(len(result), 12)
        self.assertEqual(result[-1]['label'], 'Q3 2024')

    def test_survives_an_empty_or_missing_payload(self):
        self.assertEqual(statements.to_quarterly(None, []), [])
        self.assertEqual(statements.to_quarterly({'data': []}, []), [])
```

- [ ] **Step 2: Run the tests and see them fail**

Run from `backend/`: `python manage.py test research.test_statements_shaping`
Expected: an import error, `cannot import name 'statements'`.

- [ ] **Step 3: Implement `backend/research/statements.py`**

```python
from datetime import date

PREFIX = 'us-gaap_'
SINGLE_QUARTER_MAX_DAYS = 100
QUARTERS_KEPT = 12

INCOME = {
    'revenue': (
        'Revenues',
        'RevenueFromContractWithCustomerExcludingAssessedTax',
        'RevenueFromContractWithCustomerIncludingAssessedTax',
        'SalesRevenueNet',
        'RevenuesNetOfInterestExpense',
        'SalesRevenueGoodsNet',
    ),
    'cost_of_revenue': ('CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'),
    'gross_profit': ('GrossProfit',),
    'research_development': ('ResearchAndDevelopmentExpense',),
    'selling_general_admin': ('SellingGeneralAndAdministrativeExpense',),
    'operating_income': ('OperatingIncomeLoss',),
    'pretax_income': (
        'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
        'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
    ),
    'income_tax': ('IncomeTaxExpenseBenefit',),
    'net_income': ('NetIncomeLoss', 'ProfitLoss'),
}

PER_SHARE = {
    'eps_diluted': ('EarningsPerShareDiluted',),
    'diluted_shares': ('WeightedAverageNumberOfDilutedSharesOutstanding',),
}

BALANCE = {
    'cash': ('CashAndCashEquivalentsAtCarryingValue', 'CashAndDueFromBanks'),
    'short_term_investments': (
        'MarketableSecuritiesCurrent',
        'AvailableForSaleSecuritiesCurrent',
        'ShortTermInvestments',
        'OtherShortTermInvestments',
    ),
    'receivables': ('AccountsReceivableNetCurrent',),
    'inventory': ('InventoryNet',),
    'current_assets': ('AssetsCurrent',),
    'property_plant_equipment': ('PropertyPlantAndEquipmentNet',),
    'goodwill': ('Goodwill',),
    'total_assets': ('Assets',),
    'accounts_payable': ('AccountsPayableCurrent',),
    'current_liabilities': ('LiabilitiesCurrent',),
    'long_term_debt': ('LongTermDebtNoncurrent', 'LongTermDebt'),
    'total_liabilities': ('Liabilities',),
    'equity': ('StockholdersEquity',),
}

DEBT = ('CommercialPaper', 'LongTermDebtCurrent', 'LongTermDebtNoncurrent')
SEPARATE_SGA = ('SellingAndMarketingExpense', 'GeneralAndAdministrativeExpense')
EQUITY_WITH_MINORITY = 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'

CASH_FLOW = {
    'operating_cash_flow': ('NetCashProvidedByUsedInOperatingActivities',),
    'capital_expenditure': ('PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'),
    'depreciation_amortization': (
        'DepreciationDepletionAndAmortization',
        'DepreciationAmortizationAndAccretionNet',
        'DepreciationAndAmortization',
    ),
    'stock_based_compensation': ('ShareBasedCompensation',),
    'investing_cash_flow': ('NetCashProvidedByUsedInInvestingActivities',),
    'financing_cash_flow': ('NetCashProvidedByUsedInFinancingActivities',),
    'dividends_paid': ('PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'),
    'share_repurchases': ('PaymentsForRepurchaseOfCommonStock',),
}


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _values(rows):
    found = {}
    for row in rows or []:
        concept, value = row.get('concept'), row.get('value')
        if concept and _is_number(value):
            found.setdefault(concept.removeprefix(PREFIX), value)
    return found


def _pick(values, row_candidates):
    picked = {}
    for key, candidates in row_candidates.items():
        for concept in candidates:
            if concept in values:
                picked[key] = values[concept]
                break
    return picked


def _income(values):
    income = _pick(values, INCOME)
    if 'gross_profit' not in income and 'revenue' in income and 'cost_of_revenue' in income:
        income['gross_profit'] = income['revenue'] - income['cost_of_revenue']
    if 'selling_general_admin' not in income and all(concept in values for concept in SEPARATE_SGA):
        income['selling_general_admin'] = sum(values[concept] for concept in SEPARATE_SGA)
    return income


def _balance(values):
    balance = _pick(values, BALANCE)
    debt = [values[concept] for concept in DEBT if concept in values]
    if debt:
        balance['total_debt'] = sum(debt)
    if 'total_liabilities' not in balance:
        total = values.get('LiabilitiesAndStockholdersEquity')
        equity = values.get(EQUITY_WITH_MINORITY, values.get('StockholdersEquity'))
        if total is not None and equity is not None:
            balance['total_liabilities'] = total - equity
    return balance


def _cash_flow(values):
    cash_flow = _pick(values, CASH_FLOW)
    if 'operating_cash_flow' in cash_flow and 'capital_expenditure' in cash_flow:
        cash_flow['free_cash_flow'] = cash_flow['operating_cash_flow'] - cash_flow['capital_expenditure']
    return cash_flow


def _day(stamp):
    return (stamp or '')[:10]


def _report(filing, section):
    return _values((filing.get('report') or {}).get(section))


def _latest_filings(reported, form):
    latest = {}
    for filing in (reported or {}).get('data') or []:
        if filing.get('form') != form or not _day(filing.get('endDate')) or filing.get('year') is None:
            continue
        key = (filing['year'], filing.get('quarter'))
        if key not in latest or _day(filing.get('filedDate')) > _day(latest[key].get('filedDate')):
            latest[key] = filing
    return latest


def to_annual(reported):
    rows = []
    for (year, _), filing in _latest_filings(reported, '10-K').items():
        income_values = _report(filing, 'ic')
        row = {
            'period': _day(filing['endDate']),
            'fiscal_year': year,
            'label': f'FY {year}',
            'income': {**_income(income_values), **_pick(income_values, PER_SHARE)},
            'balance': _balance(_report(filing, 'bs')),
            'cash_flow': _cash_flow(_report(filing, 'cf')),
        }
        if row['income'] or row['balance'] or row['cash_flow']:
            rows.append(row)
    return sorted(rows, key=lambda row: row['period'])


def _covers_one_quarter(filing):
    try:
        span = date.fromisoformat(_day(filing.get('endDate'))) - date.fromisoformat(_day(filing.get('startDate')))
    except ValueError:
        return False
    return span.days <= SINGLE_QUARTER_MAX_DAYS


def _flows(income, cash_flow):
    return {'income': income, 'cash_flow': cash_flow}


def _combine(left, right, operation):
    return {
        section: {key: operation(left[section][key], right[section][key]) for key in left[section] if key in right[section]}
        for section in ('income', 'cash_flow')
    }


def _quarter_row(year, quarter, period, single, balance):
    return {
        'period': period,
        'fiscal_year': year,
        'quarter': quarter,
        'label': f'Q{quarter} {year}',
        'income': single['income'],
        'balance': balance,
        'cash_flow': single['cash_flow'],
    }


def _year_quarters(year, filings, annual_row):
    rows = []
    to_date = {}
    for quarter in (1, 2, 3):
        filing = filings.get(quarter)
        if filing is None:
            continue
        reported = _flows(_income(_report(filing, 'ic')), _cash_flow(_report(filing, 'cf')))
        previous = to_date.get(quarter - 1)
        if quarter == 1:
            single = to_date[quarter] = reported
        elif _covers_one_quarter(filing):
            single = reported
            if previous is not None:
                to_date[quarter] = _combine(previous, reported, lambda a, b: a + b)
        else:
            to_date[quarter] = reported
            single = None if previous is None else _combine(reported, previous, lambda a, b: a - b)
        if single is not None:
            rows.append(_quarter_row(year, quarter, _day(filing['endDate']), single, _balance(_report(filing, 'bs'))))

    if annual_row is not None and 3 in to_date:
        full_year = _flows(annual_row['income'], annual_row['cash_flow'])
        single = _combine(full_year, to_date[3], lambda a, b: a - b)
        rows.append(_quarter_row(year, 4, annual_row['period'], single, annual_row['balance']))
    return rows


def to_quarterly(reported, annual_rows):
    by_year = {}
    for (year, quarter), filing in _latest_filings(reported, '10-Q').items():
        if quarter in (1, 2, 3):
            by_year.setdefault(year, {})[quarter] = filing

    annual_by_year = {row['fiscal_year']: row for row in annual_rows}
    rows = []
    for year, filings in by_year.items():
        rows.extend(_year_quarters(year, filings, annual_by_year.get(year)))
    return sorted(rows, key=lambda row: row['period'])[-QUARTERS_KEPT:]
```

- [ ] **Step 4: Run the tests and see them pass**

Run from `backend/`: `python manage.py test research.test_statements_shaping`
Expected: all pass. If `test_a_quarter_after_a_missing_filing_is_dropped` fails, check that a year-to-date Q3 whose Q2 is missing still records `to_date[3]` (the fourth quarter needs it) while emitting no Q3 row.

- [ ] **Step 5: Commit**

```bash
git add backend/research/statements.py backend/research/test_statements_shaping.py
git commit -m "feat(research): shape reported filings into standard statement rows"
```

---

### Task 2: Statements endpoint (backend)

**Files:**
- Modify: `backend/research/statements.py`
- Modify: `backend/research/views.py` (next to `FundamentalsView`)
- Modify: `backend/research/urls.py` (next to the `fundamentals/` route)
- Test: `backend/research/test_statements_orchestration.py`, `backend/research/test_views.py`

**Interfaces:**
- Consumes: `to_annual`, `to_quarterly` from Task 1; `finnhub.get_financials_reported(symbol, freq)`, `finnhub.FinnhubNoData`, `finnhub.FinnhubUnexpected`, `providers.ProviderUnavailable`.
- Produces: `statements.statements(symbol) -> {'available': True, 'annual': [...], 'quarterly': [...]}` and `GET /api/research/statements/<symbol>/`, which answers 200 with that body or `{'available': False, 'reason': str}`.

- [ ] **Step 1: Write the failing orchestration tests**

Create `backend/research/test_statements_orchestration.py`:

```python
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from . import finnhub, statements
from .test_statements_shaping import filing, rows

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

ANNUAL = {'data': [filing(2025, 0, '2025-01-01', '2025-12-31', ic=rows(**{'us-gaap_Revenues': 1000}))]}
QUARTERLY = {'data': [filing(2025, 1, '2025-01-01', '2025-03-31', ic=rows(**{'us-gaap_Revenues': 200}))]}


def by_frequency(symbol, freq='annual'):
    return ANNUAL if freq == 'annual' else QUARTERLY


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class StatementsTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_financials_reported', side_effect=by_frequency)
    def test_returns_annual_and_quarterly_rows(self, mock_reported):
        result = statements.statements('AAPL')

        self.assertTrue(result['available'])
        self.assertEqual(result['annual'][0]['income']['revenue'], 1000)
        self.assertEqual(result['quarterly'][0]['label'], 'Q1 2025')

    @patch('research.finnhub.get_financials_reported', side_effect=by_frequency)
    def test_a_second_call_for_the_same_symbol_does_not_refetch(self, mock_reported):
        statements.statements('AAPL')
        statements.statements('AAPL')

        self.assertEqual(mock_reported.call_count, 2)

    @patch('research.finnhub.get_financials_reported', return_value={'data': []})
    def test_no_annual_report_raises_no_data_and_is_not_cached(self, mock_reported):
        with self.assertRaises(finnhub.FinnhubNoData):
            statements.statements('ZZZZ')
        with self.assertRaises(finnhub.FinnhubNoData):
            statements.statements('ZZZZ')

        self.assertEqual(mock_reported.call_count, 2)

    @patch('research.finnhub.get_financials_reported')
    def test_a_failed_quarterly_call_still_serves_the_annual_rows(self, mock_reported):
        def answer(symbol, freq='annual'):
            if freq == 'quarterly':
                raise finnhub.FinnhubAPIError('quarterly failed')
            return ANNUAL

        mock_reported.side_effect = answer

        result = statements.statements('AAPL')

        self.assertEqual(len(result['annual']), 1)
        self.assertEqual(result['quarterly'], [])

    @patch('research.finnhub.get_financials_reported', return_value={'data': 'not a list'})
    def test_an_unreadable_payload_becomes_finnhub_unexpected(self, mock_reported):
        with self.assertRaises(finnhub.FinnhubUnexpected):
            statements.statements('AAPL')
```

- [ ] **Step 2: Run and see them fail**

Run from `backend/`: `python manage.py test research.test_statements_orchestration`
Expected: `AttributeError: module 'research.statements' has no attribute 'statements'`.

- [ ] **Step 3: Implement the cached entry point**

In `backend/research/statements.py`, change the imports at the top to:

```python
from datetime import date

from django.core.cache import cache

from . import finnhub
from .providers import ProviderUnavailable
```

and append:

```python
STATEMENTS_TTL = 86400
CACHE_V = 'v1'


def _cache_key(symbol):
    return f'research:statements:{CACHE_V}:{symbol}'


def statements(symbol):
    def produce():
        annual = to_annual(finnhub.get_financials_reported(symbol, 'annual'))
        if not annual:
            raise finnhub.FinnhubNoData(symbol)
        try:
            quarterly = to_quarterly(finnhub.get_financials_reported(symbol, 'quarterly'), annual)
        except ProviderUnavailable:
            quarterly = []
        return {'annual': annual, 'quarterly': quarterly}

    try:
        data = cache.get_or_set(_cache_key(symbol), produce, STATEMENTS_TTL)
    except ProviderUnavailable:
        raise
    except (KeyError, TypeError, IndexError, ValueError, AttributeError) as exc:
        raise finnhub.FinnhubUnexpected() from exc

    return {'available': True, **data}
```

- [ ] **Step 4: Run the orchestration tests and see them pass**

Run: `python manage.py test research.test_statements_orchestration`
Expected: all pass.

- [ ] **Step 5: Write the failing view tests**

In `backend/research/test_views.py`, add after `FundamentalsViewTest` (it reuses that file's `TEST_KEY`, `LOCMEM`, `User`, `RefreshToken`, `patch` and `cache` imports):

```python
@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY, CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class StatementsViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.get('/api/research/statements/AAPL/')
        self.assertEqual(response.status_code, 401)

    @patch('research.finnhub.get_financials_reported')
    def test_returns_available_true_with_rows(self, mock_reported):
        mock_reported.return_value = {'data': [{
            'year': 2025, 'quarter': 0, 'form': '10-K',
            'startDate': '2025-01-01 00:00:00', 'endDate': '2025-12-31 00:00:00',
            'filedDate': '2026-02-01 00:00:00',
            'report': {'ic': [{'concept': 'us-gaap_Revenues', 'value': 1000}], 'bs': [], 'cf': []},
        }]}

        response = self.client.get('/api/research/statements/aapl/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['available'])
        self.assertEqual(response.data['annual'][0]['income']['revenue'], 1000)
        mock_reported.assert_any_call('AAPL', 'annual')

    @override_settings(FINNHUB_API_KEY='')
    def test_returns_available_false_when_not_configured(self):
        response = self.client.get('/api/research/statements/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])

    @patch('research.finnhub.get_financials_reported', return_value={'data': []})
    def test_returns_available_false_for_a_company_with_no_filings(self, mock_reported):
        response = self.client.get('/api/research/statements/ZZZZ/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['available'])

    def test_rejects_a_malformed_symbol(self):
        response = self.client.get('/api/research/statements/AAPL%20US/')
        self.assertEqual(response.status_code, 400)
```

Before relying on the last test, open the existing `FundamentalsViewTest.test_rejects_a_malformed_symbol` and copy its expected status code if it is not 400.

- [ ] **Step 6: Run and see them fail**

Run: `python manage.py test research.test_views.StatementsViewTest`
Expected: 404s.

- [ ] **Step 7: Add the view and the route**

In `backend/research/views.py`, import `statements` beside the module's existing `finnhub` import (same `from . import ...` line) and add directly after `FundamentalsView`:

```python
class StatementsView(APIView):
    throttle_scope = 'research.fundamentals'

    def get(self, request, symbol):
        symbol = _symbol(symbol)
        return provider_response(lambda: statements.statements(symbol))
```

In `backend/research/urls.py`, import `StatementsView` beside `FundamentalsView` and add after the `fundamentals/` route:

```python
    path('statements/<str:symbol>/', StatementsView.as_view(), name='research-statements'),
```

- [ ] **Step 8: Run the whole research suite**

Run from `backend/`: `python manage.py test research`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add backend/research/statements.py backend/research/views.py backend/research/urls.py backend/research/test_statements_orchestration.py backend/research/test_views.py
git commit -m "feat(research): serve company statements from /api/research/statements/<symbol>/"
```

---

### Task 3: Fundamentals and earnings payload additions (backend)

**Files:**
- Modify: `backend/research/finnhub.py` (`to_fundamentals`, `CACHE_V`)
- Modify: `backend/research/earnings.py` (`_next_scheduled`, `symbol_earnings`, its `CACHE_V`)
- Test: `backend/research/test_fundamentals_shaping.py`, `backend/research/test_earnings_shaping.py`

**Interfaces:**
- Produces, on the fundamentals payload: `free_float` (millions of shares or `None`), `ipo_date` (`'YYYY-MM-DD'` or `None`), `website` (str), `country` (str), `enterprise_value` (millions or `None`), `recommendation_history` (list oldest first, same row shape as `recommendation`, at most 12), and, when Finnhub sends an annual series, `ratio_history`: a list oldest first of `{'period': 'YYYY-MM-DD', <ratio>: number}` holding the newest 10 periods. Ratio keys: `pe`, `ps`, `pb`, `ev_ebitda`, `pfcf`, `gross_margin`, `operating_margin`, `net_margin`, `roe`, `roa`, `roic`, `current_ratio`, `quick_ratio`, `cash_ratio`, `debt_to_equity`, `debt_to_assets`, `long_term_debt_to_equity`. Margins and returns are in percent.
- Produces, on the per-symbol earnings payload: `upcoming`, a list oldest first of at most four unreported calendar events in the same shape as `next`. `next` stays and equals `upcoming[0]` or `None`.

- [ ] **Step 1: Write the failing fundamentals tests**

Add to `backend/research/test_fundamentals_shaping.py` (it already defines `SAMPLE_PROFILE` and `SAMPLE_FINANCIALS`; look at how the existing tests call `finnhub.to_fundamentals` and reuse their recommendation and earnings samples, named below as `SAMPLE_RECOMMENDATION` and `SAMPLE_EARNINGS`; define them locally if the file has none):

```python
class ProfileFactsTest(SimpleTestCase):
    def shaped(self, profile=None, financials=None, recommendations=None):
        return finnhub.to_fundamentals(
            {**SAMPLE_PROFILE, **(profile or {})},
            financials if financials is not None else SAMPLE_FINANCIALS,
            recommendations if recommendations is not None else [],
            [],
        )

    def test_carries_the_profile_facts(self):
        shaped = self.shaped(profile={
            'floatingShare': 14445.7, 'ipo': '1980-12-12', 'weburl': 'https://www.apple.com/', 'country': 'US',
        })

        self.assertEqual(shaped['free_float'], 14445.7)
        self.assertEqual(shaped['ipo_date'], '1980-12-12')
        self.assertEqual(shaped['website'], 'https://www.apple.com/')
        self.assertEqual(shaped['country'], 'US')

    def test_a_profile_without_those_facts_leaves_them_empty(self):
        shaped = self.shaped()

        self.assertIsNone(shaped['free_float'])
        self.assertIsNone(shaped['ipo_date'])
        self.assertEqual(shaped['website'], '')
        self.assertEqual(shaped['country'], '')

    def test_carries_enterprise_value(self):
        shaped = self.shaped(financials={'metric': {'enterpriseValue': 5001423}})

        self.assertEqual(shaped['enterprise_value'], 5001423)

    def test_recommendation_history_is_oldest_first(self):
        shaped = self.shaped(recommendations=[
            {'period': '2026-09-01', 'strongBuy': 12, 'buy': 22, 'hold': 15, 'sell': 3, 'strongSell': 1},
            {'period': '2026-08-01', 'strongBuy': 13, 'buy': 24, 'hold': 14, 'sell': 3, 'strongSell': 0},
        ])

        self.assertEqual([row['period'] for row in shaped['recommendation_history']], ['2026-08-01', '2026-09-01'])
        self.assertEqual(shaped['recommendation_history'][-1]['strong_buy'], 12)
        self.assertEqual(shaped['recommendation']['period'], '2026-09-01')

    def test_no_recommendations_gives_an_empty_history(self):
        self.assertEqual(self.shaped()['recommendation_history'], [])


class RatioHistoryTest(SimpleTestCase):
    def shaped(self, annual):
        return finnhub.to_fundamentals(SAMPLE_PROFILE, {'metric': {}, 'series': {'annual': annual}}, [], [])

    def test_groups_the_annual_series_by_period_oldest_first(self):
        shaped = self.shaped({
            'pe': [{'period': '2025-09-27', 'v': 33.5574}, {'period': '2024-09-28', 'v': 37.2}],
            'currentRatio': [{'period': '2025-09-27', 'v': 0.8933}],
        })

        self.assertEqual(shaped['ratio_history'], [
            {'period': '2024-09-28', 'pe': 37.2},
            {'period': '2025-09-27', 'pe': 33.56, 'current_ratio': 0.89},
        ])

    def test_margins_and_returns_become_percent(self):
        shaped = self.shaped({
            'grossMargin': [{'period': '2025-09-27', 'v': 0.4691}],
            'roe': [{'period': '2025-09-27', 'v': 1.5191}],
        })

        self.assertEqual(shaped['ratio_history'], [{'period': '2025-09-27', 'gross_margin': 46.91, 'roe': 151.91}])

    def test_keeps_the_newest_ten_periods(self):
        points = [{'period': f'{year}-12-31', 'v': 10} for year in range(2005, 2026)]

        history = self.shaped({'pe': points})['ratio_history']

        self.assertEqual(len(history), 10)
        self.assertEqual(history[0]['period'], '2016-12-31')

    def test_skips_points_without_a_value_or_a_period(self):
        shaped = self.shaped({'pe': [{'period': '2025-09-27', 'v': None}, {'v': 12}, {'period': '2024-09-28', 'v': 11}]})

        self.assertEqual(shaped['ratio_history'], [{'period': '2024-09-28', 'pe': 11}])

    def test_no_annual_series_leaves_the_key_out(self):
        shaped = finnhub.to_fundamentals(SAMPLE_PROFILE, {'metric': {}}, [], [])

        self.assertNotIn('ratio_history', shaped)
```

- [ ] **Step 2: Run and see them fail**

Run: `python manage.py test research.test_fundamentals_shaping`
Expected: `KeyError: 'free_float'` and similar.

- [ ] **Step 3: Implement in `backend/research/finnhub.py`**

Change `CACHE_V = 'v4'` to `CACHE_V = 'v5'`. Add above `to_fundamentals`:

```python
RECOMMENDATION_HISTORY_MONTHS = 12
RATIO_HISTORY_YEARS = 10
PERCENT = 100

RATIO_SERIES = {
    'pe': ('pe', 1),
    'ps': ('ps', 1),
    'pb': ('pb', 1),
    'ev_ebitda': ('evEbitda', 1),
    'pfcf': ('pfcf', 1),
    'gross_margin': ('grossMargin', PERCENT),
    'operating_margin': ('operatingMargin', PERCENT),
    'net_margin': ('netMargin', PERCENT),
    'roe': ('roe', PERCENT),
    'roa': ('roa', PERCENT),
    'roic': ('roic', PERCENT),
    'current_ratio': ('currentRatio', 1),
    'quick_ratio': ('quickRatio', 1),
    'cash_ratio': ('cashRatio', 1),
    'debt_to_equity': ('totalDebtToEquity', 1),
    'debt_to_assets': ('totalDebtToTotalAsset', 1),
    'long_term_debt_to_equity': ('longtermDebtTotalEquity', 1),
}


def _ratio_history(financials):
    annual = (financials.get('series') or {}).get('annual') or {}
    by_period = {}
    for field, (series_key, scale) in RATIO_SERIES.items():
        for point in annual.get(series_key) or []:
            if point.get('v') is None or not point.get('period'):
                continue
            by_period.setdefault(point['period'], {})[field] = round(point['v'] * scale, 2)
    periods = sorted(by_period)[-RATIO_HISTORY_YEARS:]
    return [{'period': period, **by_period[period]} for period in periods]
```

In `to_fundamentals`, add these entries to the `shaped` dict literal, directly after `'shares_outstanding'`:

```python
        'free_float': profile.get('floatingShare'),
        'ipo_date': profile.get('ipo') or None,
        'website': profile.get('weburl', ''),
        'country': profile.get('country', ''),
        'enterprise_value': _metric(financials, 'enterpriseValue'),
```

and directly after the `'recommendation'` entry:

```python
        'recommendation_history': [
            _to_recommendation(row) for row in reversed(recommendations[:RECOMMENDATION_HISTORY_MONTHS])
        ],
```

and after the `trends` block near the end of the function:

```python
    ratio_history = _ratio_history(financials)
    if ratio_history:
        shaped['ratio_history'] = ratio_history
```

- [ ] **Step 4: Run the fundamentals tests and see them pass**

Run: `python manage.py test research.test_fundamentals_shaping research.test_fundamentals_orchestration research.test_views`
Expected: all pass.

- [ ] **Step 5: Write the failing earnings test**

Open `backend/research/test_earnings_shaping.py` and `backend/research/earnings.py`. `_fetch_calendar(symbol, date_from, date_to)` returns shaped events with `date` and `eps_actual` keys. Add:

```python
from datetime import date
from unittest.mock import patch

from . import earnings


class UpcomingTest(TestCase):
    def event(self, day, actual=None):
        return {'date': day, 'eps_actual': actual, 'eps_estimate': 1.0}

    @patch('research.earnings._fetch_calendar')
    def test_lists_unreported_events_oldest_first(self, mock_calendar):
        mock_calendar.return_value = [
            self.event('2027-04-28'), self.event('2027-01-27'), self.event('2026-11-02'),
        ]

        upcoming = earnings._upcoming('AAPL', date(2026, 10, 13))

        self.assertEqual([e['date'] for e in upcoming], ['2026-11-02', '2027-01-27', '2027-04-28'])

    @patch('research.earnings._fetch_calendar')
    def test_leaves_out_past_and_already_reported_events(self, mock_calendar):
        mock_calendar.return_value = [
            self.event('2026-10-01'), self.event('2026-11-02', actual=2.1), self.event('2027-01-27'),
        ]

        upcoming = earnings._upcoming('AAPL', date(2026, 10, 13))

        self.assertEqual([e['date'] for e in upcoming], ['2027-01-27'])

    @patch('research.earnings._fetch_calendar')
    def test_keeps_at_most_four(self, mock_calendar):
        mock_calendar.return_value = [self.event(f'2027-0{month}-15') for month in range(1, 7)]

        self.assertEqual(len(earnings._upcoming('AAPL', date(2026, 10, 13))), 4)

    @patch('research.earnings._fetch_calendar', return_value=[])
    def test_nothing_scheduled_gives_an_empty_list(self, mock_calendar):
        self.assertEqual(earnings._upcoming('AAPL', date(2026, 10, 13)), [])
```

Merge the two imports with the ones the file already has instead of duplicating them.

- [ ] **Step 6: Run and see it fail**

Run: `python manage.py test research.test_earnings_shaping.UpcomingTest`
Expected: `AttributeError: module 'research.earnings' has no attribute '_upcoming'`.

- [ ] **Step 7: Implement in `backend/research/earnings.py`**

Replace `_next_scheduled` with:

```python
UPCOMING_KEPT = 4


def _upcoming(symbol, today):
    rows = _fetch_calendar(symbol, today, today + HISTORY_AHEAD)
    unreported = [e for e in rows if (e['date'] or '') >= today.isoformat() and e['eps_actual'] is None]
    return sorted(unreported, key=lambda event: event['date'])[:UPCOMING_KEPT]
```

and in `symbol_earnings`, replace the body of `produce` with:

```python
        history = _eps_history(symbol)
        upcoming = _upcoming(symbol, today)
        return {
            'history': history,
            'next': upcoming[0] if upcoming else None,
            'upcoming': upcoming,
            'score': _score(history),
        }
```

Bump `earnings.py`'s own `CACHE_V` constant by one version (for example `'v3'` to `'v4'`), so a cached payload without `upcoming` is not served. If any test or module still references `_next_scheduled`, update it to `_upcoming` and adjust the expectation from one event to a list.

- [ ] **Step 8: Run the whole research suite**

Run from `backend/`: `python manage.py test research`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add backend/research/finnhub.py backend/research/earnings.py backend/research/test_fundamentals_shaping.py backend/research/test_earnings_shaping.py
git commit -m "feat(research): profile facts, ratio and recommendation history, upcoming earnings quarters"
```

---

### Task 4: Statements data layer and `lib/statements.js` (frontend)

**Files:**
- Modify: `frontend/src/api/client/research.js`, `frontend/src/api/queries/research.js`
- Modify: `frontend/src/lib/charts.js`
- Create: `frontend/src/lib/statements.js`
- Test: `frontend/src/lib/statements.test.js`

**Interfaces:**
- Consumes: the endpoint from Task 2.
- Produces: `getStatements(symbol)`; `useStatements(symbol)` (a React Query result whose `data` is the endpoint body; disabled for an empty symbol); `researchKeys.statements(symbol)`.
- Produces from `lib/statements.js`: `STATEMENTS` (array of `{ key, label, rows: [{ key, label, headline?, format? }] }` for `income`, `balance`, `cash_flow`), `statementByKey(key)`, `latestPeriods(periods, count)`, `rowsWithData(statement, periods)`, `priorYearPeriod(periods, period)`, `changePct(periods, period, statementKey, rowKey)`, `fmtStatement(value, format)`, `CHART_SERIES` (array of `{ key, label }`), `chartRows(periods)`, `waterfallSteps(period)` returning `[{ key, label, kind: 'total' | 'change', from, to }]`.
- Produces from `lib/charts.js`: `STATEMENT_SERIES`, an object keyed `revenue`, `gross_profit`, `operating_income`, `net_income` with one colour each.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/statements.test.js`:

```js
import { describe, expect, it } from 'vitest'

import {
  CHART_SERIES,
  STATEMENTS,
  changePct,
  chartRows,
  fmtStatement,
  latestPeriods,
  priorYearPeriod,
  rowsWithData,
  statementByKey,
  waterfallSteps,
} from './statements'

const year = (fiscal_year, income, extra = {}) => ({
  period: `${fiscal_year}-12-31`,
  fiscal_year,
  label: `FY ${fiscal_year}`,
  income,
  balance: {},
  cash_flow: {},
  ...extra,
})

const quarter = (fiscal_year, q, income) => ({
  period: `${fiscal_year}-${String(q * 3).padStart(2, '0')}-28`,
  fiscal_year,
  quarter: q,
  label: `Q${q} ${fiscal_year}`,
  income,
  balance: {},
  cash_flow: {},
})

describe('STATEMENTS', () => {
  it('lists the three statements in reading order', () => {
    expect(STATEMENTS.map((statement) => statement.key)).toEqual(['income', 'balance', 'cash_flow'])
  })

  it('marks the headline income rows', () => {
    const headlines = statementByKey('income').rows.filter((row) => row.headline).map((row) => row.key)
    expect(headlines).toEqual(['revenue', 'gross_profit', 'operating_income', 'net_income'])
  })

  it('falls back to the income statement for an unknown key', () => {
    expect(statementByKey('nonsense').key).toBe('income')
  })
})

describe('latestPeriods', () => {
  it('keeps the newest periods, oldest first', () => {
    const periods = [year(2021, {}), year(2022, {}), year(2023, {})]
    expect(latestPeriods(periods, 2).map((p) => p.fiscal_year)).toEqual([2022, 2023])
  })

  it('returns an empty list for a missing input', () => {
    expect(latestPeriods(undefined, 5)).toEqual([])
  })
})

describe('rowsWithData', () => {
  it('drops a row no visible period reports', () => {
    const periods = [year(2024, { revenue: 10, net_income: 2 }), year(2025, { revenue: 12, net_income: 3 })]
    const keys = rowsWithData(statementByKey('income'), periods).map((row) => row.key)
    expect(keys).toEqual(['revenue', 'net_income'])
  })

  it('keeps a row reported in only one period', () => {
    const periods = [year(2024, { revenue: 10 }), year(2025, { revenue: 12, gross_profit: 5 })]
    expect(rowsWithData(statementByKey('income'), periods).map((row) => row.key)).toContain('gross_profit')
  })
})

describe('priorYearPeriod', () => {
  it('finds the previous fiscal year for an annual period', () => {
    const periods = [year(2024, {}), year(2025, {})]
    expect(priorYearPeriod(periods, periods[1])).toBe(periods[0])
  })

  it('finds the same quarter a fiscal year earlier', () => {
    const periods = [quarter(2026, 2, {}), quarter(2026, 3, {}), quarter(2027, 2, {})]
    expect(priorYearPeriod(periods, periods[2])).toBe(periods[0])
  })

  it('returns null when that period was never filed', () => {
    const periods = [quarter(2026, 3, {}), quarter(2027, 2, {})]
    expect(priorYearPeriod(periods, periods[1])).toBeNull()
  })
})

describe('changePct', () => {
  it('is the change from the prior year', () => {
    const periods = [year(2024, { revenue: 100 }), year(2025, { revenue: 125 })]
    expect(changePct(periods, periods[1], 'income', 'revenue')).toBeCloseTo(25)
  })

  it('divides by the size of a negative base', () => {
    const periods = [year(2024, { net_income: -50 }), year(2025, { net_income: 25 })]
    expect(changePct(periods, periods[1], 'income', 'net_income')).toBeCloseTo(150)
  })

  it('is null without a prior period, a prior value, or with a zero base', () => {
    const periods = [year(2024, { revenue: 0 }), year(2025, { revenue: 10, gross_profit: 4 })]
    expect(changePct(periods, periods[0], 'income', 'revenue')).toBeNull()
    expect(changePct(periods, periods[1], 'income', 'gross_profit')).toBeNull()
    expect(changePct(periods, periods[1], 'income', 'revenue')).toBeNull()
  })
})

describe('fmtStatement', () => {
  it('prints dollars compactly', () => {
    expect(fmtStatement(416_161_000_000)).toBe('416.16B')
    expect(fmtStatement(-1_500_000_000)).toBe('-1.50B')
  })

  it('prints a per-share figure with two decimals', () => {
    expect(fmtStatement(7.459, 'perShare')).toBe('7.46')
  })

  it('prints a dash for a missing value', () => {
    expect(fmtStatement(null)).toBe('—')
    expect(fmtStatement(undefined, 'perShare')).toBe('—')
  })
})

describe('chartRows', () => {
  it('carries the four headline series per period', () => {
    const rows = chartRows([year(2025, { revenue: 10, gross_profit: 6, operating_income: 3, net_income: 2, income_tax: 1 })])
    expect(rows).toEqual([{ label: 'FY 2025', revenue: 10, gross_profit: 6, operating_income: 3, net_income: 2 }])
  })

  it('leaves out a period with none of them', () => {
    expect(chartRows([year(2025, { income_tax: 1 })])).toEqual([])
  })

  it('names every charted series', () => {
    expect(CHART_SERIES.map((series) => series.key)).toEqual(['revenue', 'gross_profit', 'operating_income', 'net_income'])
  })
})

describe('waterfallSteps', () => {
  it('walks from revenue to net income through each subtotal', () => {
    const steps = waterfallSteps(year(2025, { revenue: 100, gross_profit: 60, operating_income: 35, net_income: 28 }))

    expect(steps.map((step) => [step.key, step.kind, step.from, step.to])).toEqual([
      ['revenue', 'total', 0, 100],
      ['cost_of_revenue', 'change', 100, 60],
      ['gross_profit', 'total', 0, 60],
      ['operating_expenses', 'change', 60, 35],
      ['operating_income', 'total', 0, 35],
      ['tax_and_other', 'change', 35, 28],
      ['net_income', 'total', 0, 28],
    ])
  })

  it('goes straight from revenue to net income for a company with no subtotals', () => {
    const steps = waterfallSteps(year(2025, { revenue: 100, net_income: 30 }))

    expect(steps.map((step) => step.key)).toEqual(['revenue', 'tax_and_other', 'net_income'])
    expect(steps[1]).toMatchObject({ from: 100, to: 30 })
  })

  it('handles a net loss', () => {
    const steps = waterfallSteps(year(2025, { revenue: 100, operating_income: -20, net_income: -25 }))

    expect(steps.at(-1)).toMatchObject({ key: 'net_income', from: 0, to: -25 })
  })

  it('is empty without revenue or net income', () => {
    expect(waterfallSteps(year(2025, { revenue: 100 }))).toEqual([])
    expect(waterfallSteps(year(2025, { net_income: 5 }))).toEqual([])
    expect(waterfallSteps(null)).toEqual([])
  })
})
```

- [ ] **Step 2: Run and see them fail**

Run from `frontend/`: `npx vitest run src/lib/statements.test.js`
Expected: fails to resolve `./statements`.

- [ ] **Step 3: Implement `frontend/src/lib/statements.js`**

```js
import { UNKNOWN, fmtCompact, fmtNum, fmtShares } from './format'

export const STATEMENTS = [
  {
    key: 'income',
    label: 'Income statement',
    rows: [
      { key: 'revenue', label: 'Revenue', headline: true },
      { key: 'cost_of_revenue', label: 'Cost of revenue' },
      { key: 'gross_profit', label: 'Gross profit', headline: true },
      { key: 'research_development', label: 'Research & development' },
      { key: 'selling_general_admin', label: 'Selling, general & admin' },
      { key: 'operating_income', label: 'Operating income', headline: true },
      { key: 'pretax_income', label: 'Pretax income' },
      { key: 'income_tax', label: 'Income tax' },
      { key: 'net_income', label: 'Net income', headline: true },
      { key: 'eps_diluted', label: 'Diluted EPS', format: 'perShare' },
      { key: 'diluted_shares', label: 'Diluted shares', format: 'shares' },
    ],
  },
  {
    key: 'balance',
    label: 'Balance sheet',
    rows: [
      { key: 'cash', label: 'Cash & equivalents' },
      { key: 'short_term_investments', label: 'Short-term investments' },
      { key: 'receivables', label: 'Receivables' },
      { key: 'inventory', label: 'Inventory' },
      { key: 'current_assets', label: 'Current assets' },
      { key: 'property_plant_equipment', label: 'Property, plant & equipment' },
      { key: 'goodwill', label: 'Goodwill' },
      { key: 'total_assets', label: 'Total assets', headline: true },
      { key: 'accounts_payable', label: 'Accounts payable' },
      { key: 'current_liabilities', label: 'Current liabilities' },
      { key: 'long_term_debt', label: 'Long-term debt' },
      { key: 'total_debt', label: 'Total debt' },
      { key: 'total_liabilities', label: 'Total liabilities', headline: true },
      { key: 'equity', label: 'Shareholders’ equity', headline: true },
    ],
  },
  {
    key: 'cash_flow',
    label: 'Cash flow',
    rows: [
      { key: 'operating_cash_flow', label: 'Operating cash flow', headline: true },
      { key: 'capital_expenditure', label: 'Capital expenditure' },
      { key: 'free_cash_flow', label: 'Free cash flow', headline: true },
      { key: 'depreciation_amortization', label: 'Depreciation & amortization' },
      { key: 'stock_based_compensation', label: 'Stock-based compensation' },
      { key: 'investing_cash_flow', label: 'Investing cash flow' },
      { key: 'financing_cash_flow', label: 'Financing cash flow' },
      { key: 'dividends_paid', label: 'Dividends paid' },
      { key: 'share_repurchases', label: 'Share repurchases' },
    ],
  },
]

export const statementByKey = (key) => STATEMENTS.find((statement) => statement.key === key) ?? STATEMENTS[0]

export const latestPeriods = (periods, count) => (periods ?? []).slice(-count)

export function rowsWithData(statement, periods) {
  return statement.rows.filter((row) => periods.some((period) => period[statement.key]?.[row.key] != null))
}

export function priorYearPeriod(periods, period) {
  const sameQuarter = (candidate) => (candidate.quarter ?? 0) === (period.quarter ?? 0)
  return periods.find((candidate) => candidate.fiscal_year === period.fiscal_year - 1 && sameQuarter(candidate)) ?? null
}

export function changePct(periods, period, statementKey, rowKey) {
  const current = period[statementKey]?.[rowKey]
  const prior = priorYearPeriod(periods, period)?.[statementKey]?.[rowKey]
  if (current == null || prior == null || prior === 0) return null
  return ((current - prior) / Math.abs(prior)) * 100
}

const MILLION = 1e6

export function fmtStatement(value, format) {
  if (value == null) return UNKNOWN
  if (format === 'perShare') return fmtNum(value, 2)
  if (format === 'shares') return fmtShares(value)
  return fmtCompact(value / MILLION)
}

export const CHART_SERIES = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'gross_profit', label: 'Gross profit' },
  { key: 'operating_income', label: 'Operating income' },
  { key: 'net_income', label: 'Net income' },
]

export function chartRows(periods) {
  return periods
    .map((period) => {
      const row = { label: period.label }
      for (const { key } of CHART_SERIES) {
        if (period.income?.[key] != null) row[key] = period.income[key]
      }
      return row
    })
    .filter((row) => Object.keys(row).length > 1)
}

export function waterfallSteps(period) {
  const income = period?.income ?? {}
  if (income.revenue == null || income.net_income == null) return []

  const steps = [{ key: 'revenue', label: 'Revenue', kind: 'total', from: 0, to: income.revenue }]
  let level = income.revenue
  const moveTo = (key, label, to) => {
    steps.push({ key, label, kind: 'change', from: level, to })
    level = to
  }
  const subtotal = (key, label) => steps.push({ key, label, kind: 'total', from: 0, to: level })

  if (income.gross_profit != null) {
    moveTo('cost_of_revenue', 'Cost of revenue', income.gross_profit)
    subtotal('gross_profit', 'Gross profit')
  }
  if (income.operating_income != null) {
    moveTo('operating_expenses', 'Operating expenses', income.operating_income)
    subtotal('operating_income', 'Operating income')
  }
  moveTo('tax_and_other', 'Tax & other', income.net_income)
  subtotal('net_income', 'Net income')
  return steps
}
```

Check `fmtShares` in `lib/format.js` first: it must accept a raw share count. If it expects another unit, convert in `fmtStatement` and add a test line for `fmtStatement(15_000_000_000, 'shares')` with the string it really prints.

- [ ] **Step 4: Run and see them pass**

Run: `npx vitest run src/lib/statements.test.js`
Expected: all pass.

- [ ] **Step 5: Add the series colours**

In `frontend/src/lib/charts.js`, after the `SERIES_TOTAL` line, add:

```js
export const STATEMENT_SERIES = {
  revenue: REPORTED,
  gross_profit: SERIES_TOTAL,
  operating_income: SERIES_BANK,
  net_income: POSITIVE,
}
```

- [ ] **Step 6: Add the client call and the hook**

In `frontend/src/api/client/research.js`, after `getFundamentals`:

```js
export const getStatements = (symbol) => apiFetch(`/api/research/statements/${symbol}/`)
```

In `frontend/src/api/queries/research.js`: import `getStatements` beside `getFundamentals`; add `statements: (symbol) => ['statements', symbol],` to `researchKeys` after `fundamentals`; and add after `useFundamentals`:

```js
export function useStatements(symbol) {
  return useQuery({
    queryKey: researchKeys.statements(symbol),
    queryFn: () => getStatements(symbol),
    enabled: !!symbol,
    staleTime: 24 * 60 * 60_000,
  })
}
```

If `frontend/src/api/queries/research.test.jsx` has a test for `useFundamentals`, add the same test for `useStatements` (it fetches `/api/research/statements/NVDA/`, and does not fetch for an empty symbol). If `api/client/index.js` or `api/queries/index.js` lists exports by name instead of `export *`, add the new names there.

- [ ] **Step 7: Run the affected suites and lint**

Run: `npx vitest run src/lib src/api && npx eslint src/lib src/api`
Expected: all pass, no lint output.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/statements.js frontend/src/lib/statements.test.js frontend/src/lib/charts.js frontend/src/api
git commit -m "feat(research): statements query hook and the logic behind the financials views"
```

---

### Task 5: Financials chart and statement table (frontend)

**Files:**
- Create: `frontend/src/components/research/FinancialsChart.jsx`, `frontend/src/components/research/StatementTable.jsx`
- Test: `frontend/src/components/research/FinancialsChart.test.jsx`, `frontend/src/components/research/StatementTable.test.jsx`

**Interfaces:**
- Consumes: `CHART_SERIES`, `chartRows`, `rowsWithData`, `changePct`, `fmtStatement` from `lib/statements.js`; `STATEMENT_SERIES`, `axisProps`, `gridProps`, `chartTooltipProps` from `lib/charts.js`; `fmtAxisDollars`, `fmtTooltipDollars` from `lib/axisFormat.js`; `fmtPct`, `pctToneClass` from `lib/format.js`.
- Produces: `<FinancialsChart periods={visiblePeriods} />` (bare chart, no `Card`; renders nothing without a charted row) and `<StatementTable statement={statementDefinition} periods={visiblePeriods} allPeriods={allPeriods} />` (bare table; `allPeriods` is the full list used to look up the prior year).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/research/StatementTable.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { statementByKey } from '../../lib/statements'
import StatementTable from './StatementTable'

const year = (fiscal_year, income) => ({
  period: `${fiscal_year}-12-31`,
  fiscal_year,
  label: `FY ${fiscal_year}`,
  income,
  balance: {},
  cash_flow: {},
})

const periods = [
  year(2023, { revenue: 80_000_000_000, net_income: -4_000_000_000 }),
  year(2024, { revenue: 100_000_000_000, net_income: 10_000_000_000 }),
  year(2025, { revenue: 125_000_000_000, net_income: 20_000_000_000, eps_diluted: 2.5 }),
]

const renderTable = (visible = periods.slice(-2)) =>
  render(<StatementTable statement={statementByKey('income')} periods={visible} allPeriods={periods} />)

describe('StatementTable', () => {
  it('has a column per visible period, oldest first', () => {
    renderTable()

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Income statement', 'FY 2024', 'FY 2025'])
  })

  it('prints each reported row and leaves out the ones nobody reports', () => {
    renderTable()

    expect(screen.getByRole('rowheader', { name: 'Revenue' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Diluted EPS' })).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: 'Gross profit' })).not.toBeInTheDocument()
  })

  it('formats dollars compactly and a missing cell as a dash', () => {
    renderTable()

    const revenue = screen.getByRole('rowheader', { name: 'Revenue' }).closest('tr')
    expect(within(revenue).getByText('125.00B')).toBeInTheDocument()
    const eps = screen.getByRole('rowheader', { name: 'Diluted EPS' }).closest('tr')
    expect(within(eps).getByText('—')).toBeInTheDocument()
    expect(within(eps).getByText('2.50')).toBeInTheDocument()
  })

  it('shows the year-on-year change under a headline figure', () => {
    renderTable()

    const revenue = screen.getByRole('rowheader', { name: 'Revenue' }).closest('tr')
    expect(within(revenue).getAllByText('+25.00%')).toHaveLength(2)
  })

  it('compares against a period that is not on screen', () => {
    renderTable(periods.slice(-1))

    const net = screen.getByRole('rowheader', { name: 'Net income' }).closest('tr')
    expect(within(net).getByText('+100.00%')).toBeInTheDocument()
  })

  it('shows no change where there is no prior year', () => {
    renderTable(periods.slice(0, 1))

    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
  })

  it('shows no change under a row that is not a headline', () => {
    renderTable()

    const eps = screen.getByRole('rowheader', { name: 'Diluted EPS' }).closest('tr')
    expect(within(eps).queryByText(/%$/)).not.toBeInTheDocument()
  })

  it('renders nothing when no row has data', () => {
    const { container } = render(
      <StatementTable statement={statementByKey('balance')} periods={periods} allPeriods={periods} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
```

Note on the fourth test: FY 2024 against FY 2023 is 80 to 100, also +25.00%, so both cells read the same.

Create `frontend/src/components/research/FinancialsChart.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import FinancialsChart from './FinancialsChart'

const year = (fiscal_year, income) => ({ period: `${fiscal_year}-12-31`, fiscal_year, label: `FY ${fiscal_year}`, income })

describe('FinancialsChart', () => {
  it('labels the chart and lists the series it draws', () => {
    render(<FinancialsChart periods={[year(2025, { revenue: 10, gross_profit: 6, operating_income: 3, net_income: 2 })]} />)

    expect(screen.getByRole('img', { name: /revenue and profit by period/i })).toBeInTheDocument()
    for (const name of ['Revenue', 'Gross profit', 'Operating income', 'Net income']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('leaves a series the company does not report out of the legend', () => {
    render(<FinancialsChart periods={[year(2025, { revenue: 10, net_income: 2 })]} />)

    expect(screen.getByText('Revenue')).toBeInTheDocument()
    expect(screen.queryByText('Gross profit')).not.toBeInTheDocument()
  })

  it('renders nothing without a charted figure', () => {
    const { container } = render(<FinancialsChart periods={[year(2025, { income_tax: 1 })]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run and see them fail**

Run from `frontend/`: `npx vitest run src/components/research/StatementTable.test.jsx src/components/research/FinancialsChart.test.jsx`
Expected: both fail to resolve their component.

- [ ] **Step 3: Implement `StatementTable.jsx`**

```jsx
import { fmtPct, pctToneClass } from '../../lib/format'
import { changePct, fmtStatement, rowsWithData } from '../../lib/statements'

export default function StatementTable({ statement, periods, allPeriods }) {
  const rows = rowsWithData(statement, periods)
  if (!rows.length) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[var(--fig-xs)]">
        <thead>
          <tr className="text-zinc-500">
            <th scope="col" className="sticky left-0 bg-zinc-900 text-left font-medium py-2 pr-4 whitespace-nowrap">
              {statement.label}
            </th>
            {periods.map((period) => (
              <th key={period.period} scope="col" className="text-right font-medium py-2 pl-4 whitespace-nowrap">
                {period.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-white/[0.06]">
              <th
                scope="row"
                className={`sticky left-0 bg-zinc-900 text-left font-normal py-2 pr-4 whitespace-nowrap ${
                  row.headline ? 'text-zinc-100' : 'text-zinc-400'
                }`}
              >
                {row.label}
              </th>
              {periods.map((period) => {
                const change = row.headline ? changePct(allPeriods, period, statement.key, row.key) : null
                return (
                  <td key={period.period} className="text-right py-2 pl-4 align-top whitespace-nowrap">
                    <span className={`block num font-mono ${row.headline ? 'text-zinc-100' : 'text-zinc-300'}`}>
                      {fmtStatement(period[statement.key]?.[row.key], row.format)}
                    </span>
                    {change != null && (
                      <span className={`block num font-mono text-[var(--fig-2xs)] ${pctToneClass(change)}`}>
                        {fmtPct(change)}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

The sticky cells need the card's own background so scrolled columns pass under them. Open `Card` in `components/ui.jsx`, read the background class it uses, and use that same class in place of `bg-zinc-900` if it differs.

- [ ] **Step 4: Implement `FinancialsChart.jsx`**

```jsx
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { fmtAxisDollars, fmtTooltipDollars } from '../../lib/axisFormat'
import { STATEMENT_SERIES, axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { CHART_SERIES, chartRows } from '../../lib/statements'

export default function FinancialsChart({ periods }) {
  const rows = chartRows(periods)
  if (!rows.length) return null
  const series = CHART_SERIES.filter(({ key }) => rows.some((row) => row[key] != null))

  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[var(--fig-2xs)] text-zinc-400">
        {series.map(({ key, label }) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATEMENT_SERIES[key] }} />
            {label}
          </li>
        ))}
      </ul>
      <div className="mt-3 h-[var(--chart-h-lg)]" role="img" aria-label="Revenue and profit by period">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="label" />
            <YAxis {...axisProps} width={56} tickFormatter={fmtAxisDollars} />
            <ReferenceLine y={0} stroke={gridProps.stroke} />
            <Tooltip
              {...chartTooltipProps}
              cursor={{ fill: gridProps.stroke }}
              formatter={(value, name) => [fmtTooltipDollars(value), name]}
            />
            {series.map(({ key, label }) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                fill={STATEMENT_SERIES[key]}
                radius={[2, 2, 0, 0]}
                maxBarSize={14}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run, lint and see them pass**

Run: `npx vitest run src/components/research/StatementTable.test.jsx src/components/research/FinancialsChart.test.jsx && npx eslint src/components/research/StatementTable.jsx src/components/research/FinancialsChart.jsx`
Expected: all pass, no lint output.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/research/StatementTable.jsx frontend/src/components/research/StatementTable.test.jsx frontend/src/components/research/FinancialsChart.jsx frontend/src/components/research/FinancialsChart.test.jsx
git commit -m "feat(research): multi-year financials chart and statement table"
```

---

### Task 6: Profit waterfall and the Financials tab (frontend)

**Files:**
- Create: `frontend/src/components/research/ProfitWaterfall.jsx`, `frontend/src/components/research/FinancialsTab.jsx`
- Test: `frontend/src/components/research/ProfitWaterfall.test.jsx`, `frontend/src/components/research/FinancialsTab.test.jsx`

**Interfaces:**
- Consumes: `useStatements` (Task 4); `STATEMENTS`, `statementByKey`, `latestPeriods`, `waterfallSteps`, `fmtStatement` (Task 4); `FinancialsChart`, `StatementTable` (Task 5); the existing `CashFlowTrendChart` (`trend` prop) and `QuarterlyTrendsChart` (`trends` prop); `Card`, `CardHeader`, `Skeleton`, `TBtn` from `components/ui`; `NEGATIVE`, `POSITIVE`, `REPORTED`, `TRACK` from `lib/charts.js`.
- Produces: `<ProfitWaterfall period={period} />` (bare; nothing when there are no steps) and `<FinancialsTab symbol={symbol} fundamentals={fundamentalsQuery} />`.

- [ ] **Step 1: Write the failing waterfall test**

Create `frontend/src/components/research/ProfitWaterfall.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import ProfitWaterfall from './ProfitWaterfall'

const period = (income) => ({ period: '2025-12-31', fiscal_year: 2025, label: 'FY 2025', income })

describe('ProfitWaterfall', () => {
  it('lists each step with its amount', () => {
    render(<ProfitWaterfall period={period({ revenue: 100e9, gross_profit: 60e9, operating_income: 35e9, net_income: 28e9 })} />)

    const steps = screen.getAllByRole('listitem')
    expect(steps.map((step) => within(step).getByTestId('step-label').textContent)).toEqual([
      'Revenue', 'Cost of revenue', 'Gross profit', 'Operating expenses', 'Operating income', 'Tax & other', 'Net income',
    ])
    expect(within(steps[0]).getByText('100.00B')).toBeInTheDocument()
    expect(within(steps[1]).getByText('-40.00B')).toBeInTheDocument()
    expect(within(steps[6]).getByText('28.00B')).toBeInTheDocument()
  })

  it('keeps every bar inside the track, also below zero', () => {
    render(<ProfitWaterfall period={period({ revenue: 100e9, operating_income: -20e9, net_income: -25e9 })} />)

    for (const bar of screen.getAllByTestId('step-bar')) {
      const left = parseFloat(bar.style.left)
      const width = parseFloat(bar.style.width)
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left + width).toBeLessThanOrEqual(100.0001)
    }
  })

  it('renders nothing without revenue and net income', () => {
    const { container } = render(<ProfitWaterfall period={period({ revenue: 100e9 })} />)

    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run src/components/research/ProfitWaterfall.test.jsx`
Expected: fails to resolve the component.

- [ ] **Step 3: Implement `ProfitWaterfall.jsx`**

```jsx
import { NEGATIVE, POSITIVE, REPORTED, TRACK } from '../../lib/charts'
import { fmtStatement, waterfallSteps } from '../../lib/statements'

const stepColor = (step) => {
  if (step.kind === 'total') return REPORTED
  return step.to < step.from ? NEGATIVE : POSITIVE
}

export default function ProfitWaterfall({ period }) {
  const steps = waterfallSteps(period)
  if (!steps.length) return null

  const levels = steps.flatMap((step) => [step.from, step.to])
  const low = Math.min(0, ...levels)
  const high = Math.max(0, ...levels)
  const span = high - low || 1
  const share = (value) => ((value - low) / span) * 100

  return (
    <ol className="space-y-1.5">
      {steps.map((step) => {
        const start = share(Math.min(step.from, step.to))
        const end = share(Math.max(step.from, step.to))
        return (
          <li key={step.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_5rem] items-center gap-3 text-[var(--fig-xs)]">
            <span data-testid="step-label" className={step.kind === 'total' ? 'text-zinc-100' : 'text-zinc-400'}>
              {step.label}
            </span>
            <span className="relative h-3 rounded-sm" style={{ backgroundColor: TRACK }}>
              <span
                data-testid="step-bar"
                className="absolute top-0 bottom-0 rounded-sm"
                style={{ left: `${start}%`, width: `${Math.max(end - start, 0.5)}%`, backgroundColor: stepColor(step) }}
              />
            </span>
            <span className="num font-mono text-right text-zinc-200">{fmtStatement(step.to - step.from)}</span>
          </li>
        )
      })}
    </ol>
  )
}
```

The minimum bar width of 0.5% can push a bar that ends at 100% just past the edge. If the second test fails for that reason, clamp the left position: `left: Math.min(start, 100 - width)`.

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run src/components/research/ProfitWaterfall.test.jsx`
Expected: all pass.

- [ ] **Step 5: Write the failing tab test**

Create `frontend/src/components/research/FinancialsTab.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../../test/renderWithProviders'
import FinancialsTab from './FinancialsTab'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const idle = { data: undefined, isLoading: false, error: null }

const annual = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((fiscal_year, index) => ({
  period: `${fiscal_year}-12-31`,
  fiscal_year,
  label: `FY ${fiscal_year}`,
  income: { revenue: (index + 1) * 10e9, gross_profit: (index + 1) * 6e9, operating_income: (index + 1) * 3e9, net_income: (index + 1) * 2e9 },
  balance: { total_assets: (index + 1) * 50e9 },
  cash_flow: { operating_cash_flow: (index + 1) * 4e9 },
}))

const quarterly = [1, 2, 3, 4].map((quarter) => ({
  period: `2025-${String(quarter * 3).padStart(2, '0')}-28`,
  fiscal_year: 2025,
  quarter,
  label: `Q${quarter} 2025`,
  income: { revenue: quarter * 1e9, net_income: quarter * 2e8 },
  balance: {},
  cash_flow: {},
}))

const fundamentals = { ...idle, data: { available: true } }

const renderTab = (statements = { available: true, annual, quarterly }, props = {}) => {
  queries.useStatements.mockReturnValue({ ...idle, data: statements })
  return renderWithProviders(<FinancialsTab symbol="NVDA" fundamentals={fundamentals} {...props} />)
}

describe('FinancialsTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks for the statements of the symbol', () => {
    renderTab()

    expect(queries.useStatements).toHaveBeenCalledWith('NVDA')
  })

  it('opens on the annual income statement with the newest six years', () => {
    renderTab()

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Income statement', 'FY 2020', 'FY 2021', 'FY 2022', 'FY 2023', 'FY 2024', 'FY 2025'])
  })

  it('switches to the balance sheet and the cash flow statement', async () => {
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Balance sheet' }))
    expect(screen.getByRole('rowheader', { name: 'Total assets' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cash flow' }))
    expect(screen.getByRole('rowheader', { name: 'Operating cash flow' })).toBeInTheDocument()
  })

  it('switches to quarters', async () => {
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Quarterly' }))

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Income statement', 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'])
  })

  it('hides the quarterly switch when there are no quarters', () => {
    renderTab({ available: true, annual, quarterly: [] })

    expect(screen.queryByRole('button', { name: 'Quarterly' })).not.toBeInTheDocument()
  })

  it('shows the revenue-to-profit walk for the newest period on screen', () => {
    renderTab()

    const card = screen.getByRole('heading', { name: 'From revenue to profit' }).closest('section')
    expect(within(card).getByText('FY 2025')).toBeInTheDocument()
    expect(within(card).getByText('70.00B')).toBeInTheDocument()
  })

  it('says a balance sheet is missing instead of showing an empty table', async () => {
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Quarterly' }))
    await userEvent.click(screen.getByRole('button', { name: 'Balance sheet' }))

    expect(screen.getByText(/no balance sheet figures for these periods/i)).toBeInTheDocument()
  })

  it('shows a skeleton while the statements load', () => {
    queries.useStatements.mockReturnValue({ ...idle, isLoading: true })
    renderWithProviders(<FinancialsTab symbol="NVDA" fundamentals={fundamentals} />)

    expect(screen.getByTestId('financials-loading')).toBeInTheDocument()
  })

  it('explains when statements are unavailable', () => {
    renderTab({ available: false, reason: 'Market data is not configured.' })

    expect(screen.getByText('Market data is not configured.')).toBeInTheDocument()
  })

  it('falls back to its own words when no reason is given', () => {
    renderTab({ available: false })

    expect(screen.getByText(/statements are unavailable for NVDA/i)).toBeInTheDocument()
  })

  it('still shows the fundamentals-based charts when statements are unavailable', () => {
    queries.useStatements.mockReturnValue({ ...idle, data: { available: false } })
    const trend = [{ period: '2024-12-31', fcf: 1e9, debt: 2e9, cash: 3e9 }]
    renderWithProviders(
      <FinancialsTab symbol="NVDA" fundamentals={{ ...idle, data: { available: true, cash_flow_trend: trend } }} />,
    )

    expect(screen.getByText('Cash generation & balance sheet')).toBeInTheDocument()
  })
})
```

`renderWithProviders` lives at `frontend/src/test/renderWithProviders`; check its export shape in an existing test (for example `WatchlistRail.test.jsx`) and match it.

- [ ] **Step 6: Run and see it fail**

Run: `npx vitest run src/components/research/FinancialsTab.test.jsx`
Expected: fails to resolve the component.

- [ ] **Step 7: Implement `FinancialsTab.jsx`**

```jsx
import { useState } from 'react'

import { useStatements } from '../../api/queries'
import { STATEMENTS, latestPeriods, rowsWithData, statementByKey } from '../../lib/statements'
import { Card, CardHeader, Skeleton, TBtn } from '../ui'
import CashFlowTrendChart from './CashFlowTrendChart'
import FinancialsChart from './FinancialsChart'
import ProfitWaterfall from './ProfitWaterfall'
import QuarterlyTrendsChart from './QuarterlyTrendsChart'
import StatementTable from './StatementTable'

const VISIBLE = { annual: 6, quarterly: 8 }
const FREQUENCIES = [
  ['annual', 'Annual'],
  ['quarterly', 'Quarterly'],
]

function Statements({ symbol, statements }) {
  const [frequency, setFrequency] = useState('annual')
  const [statementKey, setStatementKey] = useState('income')

  if (statements.isLoading) {
    return (
      <Card>
        <CardHeader title="Financials" subtitle="From SEC filings, via Finnhub" />
        <Skeleton className="mt-4 h-40 w-full" data-testid="financials-loading" />
      </Card>
    )
  }

  const data = statements.data
  if (!data?.available) {
    return (
      <Card>
        <CardHeader title="Financials" subtitle="From SEC filings, via Finnhub" />
        <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">
          {data?.reason || `Statements are unavailable for ${symbol}.`}
        </p>
      </Card>
    )
  }

  const hasQuarters = data.quarterly.length > 0
  const active = hasQuarters ? frequency : 'annual'
  const allPeriods = data[active]
  const periods = latestPeriods(allPeriods, VISIBLE[active])
  const statement = statementByKey(statementKey)
  const latest = periods.at(-1)

  return (
    <>
      <Card>
        <CardHeader
          title="Revenue and profit"
          subtitle="From SEC filings, via Finnhub"
          right={
            hasQuarters ? (
              <div className="flex items-center gap-0.5">
                {FREQUENCIES.map(([key, label]) => (
                  <TBtn key={key} active={active === key} onClick={() => setFrequency(key)}>
                    {label}
                  </TBtn>
                ))}
              </div>
            ) : null
          }
        />
        <div className="mt-4">
          <FinancialsChart periods={periods} />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-0.5">
          {STATEMENTS.map(({ key, label }) => (
            <TBtn key={key} active={statement.key === key} onClick={() => setStatementKey(key)}>
              {label}
            </TBtn>
          ))}
        </div>
        <div className="mt-3">
          {rowsWithData(statement, periods).length > 0 ? (
            <StatementTable statement={statement} periods={periods} allPeriods={allPeriods} />
          ) : (
            <p className="text-[var(--fig-xs)] text-zinc-500">
              No {statement.label.toLowerCase()} figures for these periods.
            </p>
          )}
        </div>
      </Card>

      {latest && (
        <section>
          <Card>
            <CardHeader title="From revenue to profit" subtitle={latest.label} />
            <div className="mt-4">
              <ProfitWaterfall period={latest} />
            </div>
          </Card>
        </section>
      )}
    </>
  )
}

export default function FinancialsTab({ symbol, fundamentals }) {
  const statements = useStatements(symbol)
  const company = fundamentals.data?.available ? fundamentals.data : null

  return (
    <div className="space-y-4">
      <Statements symbol={symbol} statements={statements} />
      <CashFlowTrendChart trend={company?.cash_flow_trend} />
      <QuarterlyTrendsChart trends={company?.quarterly_trends} />
    </div>
  )
}
```

Adjust to what you find: `CardHeader` renders its title as a heading (the waterfall test looks it up by role `heading`); if `ProfitWaterfall` renders nothing for the latest period (no revenue or net income), drop the whole "From revenue to profit" section instead of leaving an empty card, by checking `waterfallSteps(latest).length` before rendering it.

- [ ] **Step 8: Run, lint and see them pass**

Run: `npx vitest run src/components/research/FinancialsTab.test.jsx src/components/research/ProfitWaterfall.test.jsx && npx eslint src/components/research`
Expected: all pass, no lint output.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/research/ProfitWaterfall.jsx frontend/src/components/research/ProfitWaterfall.test.jsx frontend/src/components/research/FinancialsTab.jsx frontend/src/components/research/FinancialsTab.test.jsx
git commit -m "feat(research): Financials tab with statements and a revenue-to-profit walk"
```

---

### Task 7: Statistics tab with ratio history (frontend)

**Files:**
- Rename: `frontend/src/components/research/ValuationTab.jsx` to `StatisticsTab.jsx`, and `ValuationTab.test.jsx` to `StatisticsTab.test.jsx` (use `git mv`)
- Create: `frontend/src/lib/ratioHistory.js`, `frontend/src/components/research/RatioHistoryTable.jsx`, `frontend/src/components/research/RatioHistoryChart.jsx`
- Test: `frontend/src/lib/ratioHistory.test.js`, `frontend/src/components/research/RatioHistoryTable.test.jsx`, `frontend/src/components/research/RatioHistoryChart.test.jsx`, `StatisticsTab.test.jsx`

**Interfaces:**
- Consumes: the fundamentals fields `ratio_history` (Task 3) and the existing current figures.
- Produces from `lib/ratioHistory.js`: `RATIO_GROUPS` (array of `{ key, label, ratios: [{ key, label, format: 'num' | 'pct', current }] }` where `current` names the fundamentals field holding today's figure, or is absent), `fmtRatio(value, format)`, `ratiosWithHistory(history)` (flat list of ratio definitions that have at least one point).
- Produces: `<RatioHistoryTable history={ratio_history} current={fundamentalsData} />`, `<RatioHistoryChart history={ratio_history} />`, and `StatisticsTab` (default export, prop `fundamentals`). `StatisticsTab` no longer renders the cash flow chart or the analyst recommendation bar.

- [ ] **Step 1: Write the failing lib test**

Create `frontend/src/lib/ratioHistory.test.js`:

```js
import { describe, expect, it } from 'vitest'

import { RATIO_GROUPS, fmtRatio, ratiosWithHistory } from './ratioHistory'

describe('RATIO_GROUPS', () => {
  it('groups the ratios the way the table reads', () => {
    expect(RATIO_GROUPS.map((group) => group.label)).toEqual(['Valuation', 'Profitability', 'Liquidity', 'Solvency'])
  })

  it('names where each current figure comes from', () => {
    const byKey = Object.fromEntries(RATIO_GROUPS.flatMap((group) => group.ratios).map((ratio) => [ratio.key, ratio]))
    expect(byKey.pe.current).toBe('pe_ratio')
    expect(byKey.operating_margin.current).toBe('operating_margin_ttm')
    expect(byKey.roic.current).toBeUndefined()
  })
})

describe('fmtRatio', () => {
  it('prints a multiple with two decimals and a percentage without a sign', () => {
    expect(fmtRatio(33.557, 'num')).toBe('33.56')
    expect(fmtRatio(46.91, 'pct')).toBe('46.91%')
  })

  it('prints a dash for a missing value', () => {
    expect(fmtRatio(null, 'num')).toBe('—')
  })
})

describe('ratiosWithHistory', () => {
  it('lists only ratios with at least one point', () => {
    const history = [{ period: '2024-12-31', pe: 20 }, { period: '2025-12-31', pe: 22, roe: 30 }]
    expect(ratiosWithHistory(history).map((ratio) => ratio.key)).toEqual(['pe', 'roe'])
  })

  it('is empty for a missing history', () => {
    expect(ratiosWithHistory(undefined)).toEqual([])
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run src/lib/ratioHistory.test.js`
Expected: fails to resolve `./ratioHistory`.

- [ ] **Step 3: Implement `frontend/src/lib/ratioHistory.js`**

```js
import { fmtNum, fmtPct } from './format'

export const RATIO_GROUPS = [
  {
    key: 'valuation',
    label: 'Valuation',
    ratios: [
      { key: 'pe', label: 'P/E', format: 'num', current: 'pe_ratio' },
      { key: 'ps', label: 'P/S', format: 'num', current: 'ps_ratio' },
      { key: 'pb', label: 'P/B', format: 'num', current: 'pb_ratio' },
      { key: 'ev_ebitda', label: 'EV/EBITDA', format: 'num', current: 'ev_ebitda' },
      { key: 'pfcf', label: 'P/FCF', format: 'num' },
    ],
  },
  {
    key: 'profitability',
    label: 'Profitability',
    ratios: [
      { key: 'gross_margin', label: 'Gross margin', format: 'pct', current: 'gross_margin' },
      { key: 'operating_margin', label: 'Operating margin', format: 'pct', current: 'operating_margin_ttm' },
      { key: 'net_margin', label: 'Net margin', format: 'pct', current: 'net_margin' },
      { key: 'roe', label: 'ROE', format: 'pct', current: 'roe' },
      { key: 'roa', label: 'ROA', format: 'pct', current: 'roa' },
      { key: 'roic', label: 'ROIC', format: 'pct' },
    ],
  },
  {
    key: 'liquidity',
    label: 'Liquidity',
    ratios: [
      { key: 'current_ratio', label: 'Current ratio', format: 'num', current: 'current_ratio' },
      { key: 'quick_ratio', label: 'Quick ratio', format: 'num', current: 'quick_ratio' },
      { key: 'cash_ratio', label: 'Cash ratio', format: 'num' },
    ],
  },
  {
    key: 'solvency',
    label: 'Solvency',
    ratios: [
      { key: 'debt_to_equity', label: 'Debt / equity', format: 'num', current: 'debt_to_equity' },
      { key: 'debt_to_assets', label: 'Debt / assets', format: 'num' },
      { key: 'long_term_debt_to_equity', label: 'Long-term debt / equity', format: 'num', current: 'long_term_debt_to_equity' },
    ],
  },
]

export function fmtRatio(value, format) {
  return format === 'pct' ? fmtPct(value, { sign: false }) : fmtNum(value, 2)
}

export function ratiosWithHistory(history) {
  const points = history ?? []
  return RATIO_GROUPS.flatMap((group) => group.ratios).filter((ratio) => points.some((point) => point[ratio.key] != null))
}
```

`fmtNum(null, 2)` and `fmtPct(null)` already print `—`; confirm in `lib/format.js`.

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run src/lib/ratioHistory.test.js`
Expected: all pass.

- [ ] **Step 5: Write the failing component tests**

Create `frontend/src/components/research/RatioHistoryTable.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import RatioHistoryTable from './RatioHistoryTable'

const history = [
  { period: '2023-09-30', pe: 29.1, gross_margin: 44.13 },
  { period: '2024-09-28', pe: 37.2, gross_margin: 46.21, current_ratio: 0.87 },
  { period: '2025-09-27', pe: 33.56, gross_margin: 46.91, current_ratio: 0.89 },
]
const current = { pe_ratio: 34.8, gross_margin: 48.65 }

describe('RatioHistoryTable', () => {
  it('has a column per fiscal year and one for today', () => {
    render(<RatioHistoryTable history={history} current={current} />)

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Ratio', '2023', '2024', '2025', 'Current'])
  })

  it('prints each ratio across the years and its current figure', () => {
    render(<RatioHistoryTable history={history} current={current} />)

    const pe = screen.getByRole('rowheader', { name: 'P/E' }).closest('tr')
    expect(within(pe).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['29.10', '37.20', '33.56', '34.80'])
    const margin = screen.getByRole('rowheader', { name: 'Gross margin' }).closest('tr')
    expect(within(margin).getAllByRole('cell').at(-1)).toHaveTextContent('48.65%')
  })

  it('prints a dash where a year or the current figure is missing', () => {
    render(<RatioHistoryTable history={history} current={current} />)

    const ratio = screen.getByRole('rowheader', { name: 'Current ratio' }).closest('tr')
    expect(within(ratio).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['—', '0.87', '0.89', '—'])
  })

  it('titles each group that has a ratio and skips the rest', () => {
    render(<RatioHistoryTable history={history} current={current} />)

    expect(screen.getByText('Valuation')).toBeInTheDocument()
    expect(screen.getByText('Liquidity')).toBeInTheDocument()
    expect(screen.queryByText('Solvency')).not.toBeInTheDocument()
  })

  it('renders nothing without a history', () => {
    const { container } = render(<RatioHistoryTable history={undefined} current={current} />)

    expect(container).toBeEmptyDOMElement()
  })
})
```

Create `frontend/src/components/research/RatioHistoryChart.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import RatioHistoryChart from './RatioHistoryChart'

const history = [
  { period: '2024-09-28', pe: 37.2, roe: 160 },
  { period: '2025-09-27', pe: 33.56, roe: 151.91 },
]

describe('RatioHistoryChart', () => {
  it('offers the ratios that have a history and opens on the first', () => {
    render(<RatioHistoryChart history={history} />)

    const picker = screen.getByLabelText('Ratio')
    expect([...picker.options].map((option) => option.textContent)).toEqual(['P/E', 'ROE'])
    expect(screen.getByRole('img', { name: 'P/E by fiscal year' })).toBeInTheDocument()
  })

  it('switches the charted ratio', async () => {
    render(<RatioHistoryChart history={history} />)

    await userEvent.selectOptions(screen.getByLabelText('Ratio'), 'roe')

    expect(screen.getByRole('img', { name: 'ROE by fiscal year' })).toBeInTheDocument()
  })

  it('renders nothing with fewer than two points', () => {
    const { container } = render(<RatioHistoryChart history={[{ period: '2025-09-27', pe: 33 }]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 6: Run and see them fail**

Run: `npx vitest run src/components/research/RatioHistoryTable.test.jsx src/components/research/RatioHistoryChart.test.jsx`
Expected: both fail to resolve their component.

- [ ] **Step 7: Implement `RatioHistoryTable.jsx`**

```jsx
import { Fragment } from 'react'

import { RATIO_GROUPS, fmtRatio } from '../../lib/ratioHistory'

export default function RatioHistoryTable({ history, current }) {
  const points = history ?? []
  const groups = RATIO_GROUPS.map((group) => ({
    ...group,
    ratios: group.ratios.filter((ratio) => points.some((point) => point[ratio.key] != null)),
  })).filter((group) => group.ratios.length > 0)
  if (!groups.length) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[var(--fig-xs)]">
        <thead>
          <tr className="text-zinc-500">
            <th scope="col" className="text-left font-medium py-2 pr-4">Ratio</th>
            {points.map((point) => (
              <th key={point.period} scope="col" className="text-right font-medium py-2 pl-4">
                {point.period.slice(0, 4)}
              </th>
            ))}
            <th scope="col" className="text-right font-medium py-2 pl-4 text-zinc-300">Current</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              <tr>
                <td
                  colSpan={points.length + 2}
                  role="presentation"
                  className="pt-3 pb-1 text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-500 font-medium"
                >
                  {group.label}
                </td>
              </tr>
              {group.ratios.map((ratio) => (
                <tr key={ratio.key} className="border-t border-white/[0.06]">
                  <th scope="row" className="text-left font-normal text-zinc-400 py-2 pr-4 whitespace-nowrap">
                    {ratio.label}
                  </th>
                  {points.map((point) => (
                    <td key={point.period} className="text-right num font-mono text-zinc-300 py-2 pl-4">
                      {fmtRatio(point[ratio.key], ratio.format)}
                    </td>
                  ))}
                  <td className="text-right num font-mono text-zinc-100 py-2 pl-4">
                    {fmtRatio(ratio.current ? current?.[ratio.current] : null, ratio.format)}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

The group title cell has `role="presentation"` so `getAllByRole('cell')` inside a ratio row is unaffected and the title is not announced as data. If two fiscal years share a calendar year in `period.slice(0, 4)` the header repeats; that is acceptable, the key is the full period.

- [ ] **Step 8: Implement `RatioHistoryChart.jsx`**

```jsx
import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { SERIES_TOTAL, axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { fmtRatio, ratiosWithHistory } from '../../lib/ratioHistory'
import { Select } from '../ui'

const MIN_POINTS = 2

export default function RatioHistoryChart({ history }) {
  const ratios = ratiosWithHistory(history).filter(
    (ratio) => history.filter((point) => point[ratio.key] != null).length >= MIN_POINTS,
  )
  const [chosen, setChosen] = useState(null)
  if (!ratios.length) return null

  const ratio = ratios.find((candidate) => candidate.key === chosen) ?? ratios[0]
  const rows = history.map((point) => ({ year: point.period.slice(0, 4), value: point[ratio.key] ?? null }))

  return (
    <div>
      <label className="flex items-center gap-2 text-[var(--fig-xs)] text-zinc-400">
        Ratio
        <Select value={ratio.key} onChange={(event) => setChosen(event.target.value)} className="w-auto">
          {ratios.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>
      <div className="mt-3 h-[var(--chart-h-sm)]" role="img" aria-label={`${ratio.label} by fiscal year`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="year" />
            <YAxis {...axisProps} width={52} tickFormatter={(value) => fmtRatio(value, ratio.format)} />
            <Tooltip {...chartTooltipProps} formatter={(value) => [fmtRatio(value, ratio.format), ratio.label]} />
            <Line dataKey="value" stroke={SERIES_TOTAL} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

Read `Select` in `components/ui.jsx` before using it: if it does not forward `value`/`onChange` to a native `<select>` or wraps the label differently, use it the way its other callers do, keeping the accessible name "Ratio".

- [ ] **Step 9: Rename the tab and rework it**

```bash
git mv frontend/src/components/research/ValuationTab.jsx frontend/src/components/research/StatisticsTab.jsx
git mv frontend/src/components/research/ValuationTab.test.jsx frontend/src/components/research/StatisticsTab.test.jsx
```

In `StatisticsTab.jsx`:
- Rename the default export to `StatisticsTab`; change the gate's `title` to `"Statistics"` and its `fallback` to `"Statistics are unavailable for this symbol."`.
- Delete `RECOMMENDATION_SEGMENTS`, `RecommendationBar`, the `<RecommendationBar ... />` line, the `<CashFlowTrendChart ... />` line and the `CashFlowTrendChart` import.
- After the existing "Ratios" `Card`, add:

```jsx
          {data.ratio_history?.length > 0 && (
            <Card>
              <CardHeader title="Ratios by year" subtitle="Fiscal years, from Finnhub's annual series" />
              <div className="mt-3">
                <RatioHistoryTable history={data.ratio_history} current={data} />
              </div>
              <div className="mt-5 pt-4 border-t border-white/[0.06]">
                <RatioHistoryChart history={data.ratio_history} />
              </div>
            </Card>
          )}
```

with the two imports added.

In `StatisticsTab.test.jsx`: update the import and every `ValuationTab` reference; delete the tests that asserted the analyst recommendation bar and the cash flow chart; add:

```jsx
  it('shows the ratios by year when the history is there', () => {
    renderTab({ ratio_history: [{ period: '2024-09-28', pe: 37.2 }, { period: '2025-09-27', pe: 33.56 }] })

    expect(screen.getByText('Ratios by year')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Current' })).toBeInTheDocument()
  })

  it('leaves the by-year card out without a history', () => {
    renderTab({})

    expect(screen.queryByText('Ratios by year')).not.toBeInTheDocument()
  })

  it('no longer shows analyst recommendations or the cash flow chart', () => {
    renderTab({
      recommendation: { strong_buy: 1, buy: 1, hold: 1, sell: 0, strong_sell: 0, period: '2026-09-01' },
      cash_flow_trend: [{ period: '2024-12-31', fcf: 1, debt: 1, cash: 1 }],
    })

    expect(screen.queryByText('Analyst recommendations')).not.toBeInTheDocument()
    expect(screen.queryByText('Cash generation & balance sheet')).not.toBeInTheDocument()
  })
```

where `renderTab(extra)` is a small helper in that file rendering `<StatisticsTab fundamentals={{ data: { available: true, ...extra }, isLoading: false }} />`; reuse the file's existing render helper if it has one. `pages/Research.jsx` still imports `ValuationTab` and will not compile until Task 10: update that one import line and JSX tag to `StatisticsTab` now so the suite stays green, and leave the tab key `'valuation'` for Task 10.

- [ ] **Step 10: Run the frontend suite and lint**

Run: `npx vitest run && npx eslint .`
Expected: all pass, no lint output.

- [ ] **Step 11: Commit**

```bash
git add -A frontend/src
git commit -m "feat(research): Statistics tab replaces Valuation and gains ratios by year"
```

---

### Task 8: Overview enrichments (frontend)

**Files:**
- Modify: `frontend/src/lib/analystRating.js`
- Create in `frontend/src/components/research/`: `AnalystCounts.jsx`, `AnalystRatingCard.jsx`, `KeyFactsStrip.jsx`, `OwnershipCard.jsx`, `CapitalStructureCard.jsx`, each with a test
- Modify: `frontend/src/components/research/SymbolPanel.jsx` (use `AnalystCounts`), `frontend/src/components/research/OverviewTab.jsx` and its test

**Interfaces:**
- Consumes: fundamentals fields from Task 3; `RatingGauge({ title, fraction, label })`; `PerformanceTiles({ returns })`; `trailingReturns(bars)` from `lib/performance.js`; `analystRating(recommendation)`.
- Produces: `ANALYST_GRADES` export from `lib/analystRating.js` (the existing `GRADES` array, worst to best); `<AnalystCounts rows={[[label, count], ...]} />`; `<AnalystRatingCard fundamentals={data} />`; `<KeyFactsStrip fundamentals={data} />`; `<OwnershipCard fundamentals={data} />`; `<CapitalStructureCard fundamentals={data} />`. Each card takes the **resolved** fundamentals data object and renders nothing when its inputs are missing. `OverviewTab` gains an `allBars` prop.

- [ ] **Step 1: Share the analyst counts**

In `frontend/src/lib/analystRating.js`, rename `GRADES` to `ANALYST_GRADES` and export it (`export const ANALYST_GRADES = [...]`); update the two uses in the same file.

Create `frontend/src/components/research/AnalystCounts.jsx` by moving the `Counts` component out of `SymbolPanel.jsx` unchanged, as the default export named `AnalystCounts`. In `SymbolPanel.jsx`, delete the local `Counts`, import `AnalystCounts`, and replace both `<Counts ... />` uses. Create `AnalystCounts.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import AnalystCounts from './AnalystCounts'

describe('AnalystCounts', () => {
  it('pairs each label with its count, term first', () => {
    render(<AnalystCounts rows={[['Sell', 2], ['Buy', 9]]} />)

    const terms = screen.getAllByRole('term').map((term) => term.textContent)
    const counts = screen.getAllByRole('definition').map((definition) => definition.textContent)
    expect(terms).toEqual(['Sell', 'Buy'])
    expect(counts).toEqual(['2', '9'])
    expect(screen.getAllByRole('term')[0].parentElement.firstElementChild.tagName).toBe('DT')
  })
})
```

Run `npx vitest run src/components/research/SymbolPanel.test.jsx src/components/research/AnalystCounts.test.jsx src/lib/analystRating.test.js`; all must pass before going on.

- [ ] **Step 2: Write the failing card tests**

Create `frontend/src/components/research/KeyFactsStrip.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import KeyFactsStrip from './KeyFactsStrip'

const facts = {
  market_cap: 4_976_177,
  pe_ratio: 34.8,
  eps_ttm: 7.46,
  dividend_yield: 0.41,
  ipo_date: '1980-12-12',
  industry: 'Technology',
  country: 'US',
  website: 'https://www.apple.com/',
}

const value = (label) => screen.getByText(label).parentElement.querySelector('dd').textContent

describe('KeyFactsStrip', () => {
  it('shows the key facts', () => {
    render(<KeyFactsStrip fundamentals={facts} />)

    expect(value('Market cap')).toBe('4.98T')
    expect(value('P/E')).toBe('34.80')
    expect(value('EPS (TTM)')).toBe('7.46')
    expect(value('Dividend yield')).toBe('0.41%')
    expect(value('Listed since')).toBe('1980')
    expect(value('Industry')).toBe('Technology')
    expect(value('Country')).toBe('US')
  })

  it('links the website by its host name, opening safely in a new tab', () => {
    render(<KeyFactsStrip fundamentals={facts} />)

    const link = screen.getByRole('link', { name: 'apple.com' })
    expect(link).toHaveAttribute('href', 'https://www.apple.com/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('leaves out a fact the provider did not send', () => {
    render(<KeyFactsStrip fundamentals={{ market_cap: 100, website: '', country: '', ipo_date: null }} />)

    expect(screen.getByText('Market cap')).toBeInTheDocument()
    expect(screen.queryByText('Website')).not.toBeInTheDocument()
    expect(screen.queryByText('Country')).not.toBeInTheDocument()
    expect(screen.queryByText('Listed since')).not.toBeInTheDocument()
    expect(screen.queryByText('P/E')).not.toBeInTheDocument()
  })

  it('does not link a website that is not http or https', () => {
    render(<KeyFactsStrip fundamentals={{ market_cap: 100, website: 'javascript:alert(1)' }} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders nothing with no facts at all', () => {
    const { container } = render(<KeyFactsStrip fundamentals={{}} />)

    expect(container).toBeEmptyDOMElement()
  })
})
```

Create `frontend/src/components/research/OwnershipCard.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import OwnershipCard from './OwnershipCard'

describe('OwnershipCard', () => {
  it('splits the shares into free float and closely held', () => {
    render(<OwnershipCard fundamentals={{ shares_outstanding: 1000, free_float: 800 }} />)

    expect(screen.getByText('Free float').parentElement).toHaveTextContent('80.0%')
    expect(screen.getByText('Closely held').parentElement).toHaveTextContent('20.0%')
    expect(screen.getByRole('img', { name: 'Free float 80.0%, closely held 20.0%' })).toBeInTheDocument()
  })

  it('caps a float reported above the share count', () => {
    render(<OwnershipCard fundamentals={{ shares_outstanding: 1000, free_float: 1100 }} />)

    expect(screen.getByText('Free float').parentElement).toHaveTextContent('100.0%')
    expect(screen.getByText('Closely held').parentElement).toHaveTextContent('0.0%')
  })

  it('renders nothing without both figures', () => {
    const { container, rerender } = render(<OwnershipCard fundamentals={{ shares_outstanding: 1000, free_float: null }} />)
    expect(container).toBeEmptyDOMElement()

    rerender(<OwnershipCard fundamentals={{ shares_outstanding: 0, free_float: 10 }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

Create `frontend/src/components/research/CapitalStructureCard.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import CapitalStructureCard from './CapitalStructureCard'

const value = (label) => screen.getByText(label).parentElement.querySelector('dd').textContent

describe('CapitalStructureCard', () => {
  it('reads net debt as enterprise value minus market cap', () => {
    render(<CapitalStructureCard fundamentals={{ market_cap: 4_000_000, enterprise_value: 4_050_000 }} />)

    expect(value('Market cap')).toBe('4.00T')
    expect(value('Net debt')).toBe('50.00B')
    expect(value('Enterprise value')).toBe('4.05T')
  })

  it('calls it net cash when the company holds more cash than debt', () => {
    render(<CapitalStructureCard fundamentals={{ market_cap: 4_000_000, enterprise_value: 3_900_000 }} />)

    expect(value('Net cash')).toBe('100.00B')
    expect(screen.queryByText('Net debt')).not.toBeInTheDocument()
  })

  it('renders nothing without both figures', () => {
    const { container } = render(<CapitalStructureCard fundamentals={{ market_cap: 4_000_000, enterprise_value: null }} />)

    expect(container).toBeEmptyDOMElement()
  })
})
```

Create `frontend/src/components/research/AnalystRatingCard.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import AnalystRatingCard from './AnalystRatingCard'

const month = (period, strong_buy, buy, hold, sell, strong_sell) => ({ period, strong_buy, buy, hold, sell, strong_sell })
const latest = month('2026-09-01', 12, 22, 15, 3, 1)
const history = [month('2026-06-01', 14, 24, 15, 2, 0), month('2026-07-01', 13, 23, 16, 2, 0), month('2026-08-01', 13, 24, 14, 3, 0), latest]

describe('AnalystRatingCard', () => {
  it('shows the gauge, the counts and how many analysts', () => {
    render(<AnalystRatingCard fundamentals={{ recommendation: latest, recommendation_history: history }} />)

    expect(screen.getByRole('img', { name: /analyst rating: buy/i })).toBeInTheDocument()
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(['Strong sell', 'Sell', 'Hold', 'Buy', 'Strong buy'])
    expect(screen.getByText(/53 analysts/)).toBeInTheDocument()
  })

  it('draws one trend column per month, oldest first', () => {
    render(<AnalystRatingCard fundamentals={{ recommendation: latest, recommendation_history: history }} />)

    const trend = screen.getByRole('list', { name: 'Analyst ratings by month' })
    const months = within(trend).getAllByRole('listitem')
    expect(months).toHaveLength(4)
    expect(months[0]).toHaveAccessibleName(/Jun 2026: 14 strong buy, 24 buy, 15 hold, 2 sell, 0 strong sell/i)
  })

  it('leaves the trend out with a single month', () => {
    render(<AnalystRatingCard fundamentals={{ recommendation: latest, recommendation_history: [latest] }} />)

    expect(screen.queryByRole('list', { name: 'Analyst ratings by month' })).not.toBeInTheDocument()
  })

  it('renders nothing without a recommendation', () => {
    const { container } = render(<AnalystRatingCard fundamentals={{ recommendation: null, recommendation_history: [] }} />)

    expect(container).toBeEmptyDOMElement()
  })
})
```

`fmtMonthYear('2026-06-01')` supplies the month text; read it in `lib/format.js` and adjust `/Jun 2026/` in the test if it prints another form.

- [ ] **Step 3: Run and see them fail**

Run: `npx vitest run src/components/research/KeyFactsStrip.test.jsx src/components/research/OwnershipCard.test.jsx src/components/research/CapitalStructureCard.test.jsx src/components/research/AnalystRatingCard.test.jsx`
Expected: each fails to resolve its component.

- [ ] **Step 4: Implement the four cards**

`KeyFactsStrip.jsx`:

```jsx
import { fmtCompact, fmtNum, fmtPct } from '../../lib/format'
import { Card } from '../ui'

function websiteLink(website) {
  try {
    const url = new URL(website)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return { href: url.href, host: url.hostname.replace(/^www\./, '') }
  } catch {
    return null
  }
}

export default function KeyFactsStrip({ fundamentals }) {
  const site = websiteLink(fundamentals.website)
  const facts = [
    ['Market cap', fundamentals.market_cap == null ? null : fmtCompact(fundamentals.market_cap)],
    ['P/E', fundamentals.pe_ratio == null ? null : fmtNum(fundamentals.pe_ratio, 2)],
    ['EPS (TTM)', fundamentals.eps_ttm == null ? null : fmtNum(fundamentals.eps_ttm, 2)],
    ['Dividend yield', fundamentals.dividend_yield == null ? null : fmtPct(fundamentals.dividend_yield, { sign: false })],
    ['Listed since', fundamentals.ipo_date ? fundamentals.ipo_date.slice(0, 4) : null],
    ['Industry', fundamentals.industry || null],
    ['Country', fundamentals.country || null],
    [
      'Website',
      site ? (
        <a href={site.href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
          {site.host}
        </a>
      ) : null,
    ],
  ].filter(([, value]) => value != null)
  if (!facts.length) return null

  return (
    <Card>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-500 font-medium">{label}</dt>
            <dd className="mt-1 text-[var(--fig-sm)] num font-mono text-zinc-100 truncate">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
```

`OwnershipCard.jsx`:

```jsx
import { SERIES_TOTAL, TRACK } from '../../lib/charts'
import { fmtPct } from '../../lib/format'
import { Card, CardHeader } from '../ui'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

export default function OwnershipCard({ fundamentals }) {
  const { shares_outstanding: shares, free_float: float } = fundamentals
  if (!shares || float == null) return null

  const free = Math.min(100, Math.max(0, (float / shares) * 100))
  const held = 100 - free

  return (
    <Card>
      <CardHeader title="Ownership" subtitle="Shares free to trade against shares closely held" />
      <div
        role="img"
        aria-label={`Free float ${share(free)}, closely held ${share(held)}`}
        className="mt-4 h-2.5 rounded-full overflow-hidden"
        style={{ backgroundColor: TRACK }}
      >
        <div className="h-full" style={{ width: `${free}%`, backgroundColor: SERIES_TOTAL }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-4 text-[var(--fig-xs)]">
        <div>
          <dt className="text-zinc-500">Free float</dt>
          <dd className="num font-mono text-[var(--fig-md)] text-zinc-100">{share(free)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Closely held</dt>
          <dd className="num font-mono text-[var(--fig-md)] text-zinc-100">{share(held)}</dd>
        </div>
      </dl>
    </Card>
  )
}
```

`CapitalStructureCard.jsx`:

```jsx
import { fmtCompact } from '../../lib/format'
import { Card, CardHeader } from '../ui'

export default function CapitalStructureCard({ fundamentals }) {
  const { market_cap: cap, enterprise_value: enterprise } = fundamentals
  if (cap == null || enterprise == null) return null

  const netDebt = enterprise - cap
  const rows = [
    ['Market cap', fmtCompact(cap)],
    [netDebt >= 0 ? 'Net debt' : 'Net cash', fmtCompact(Math.abs(netDebt))],
    ['Enterprise value', fmtCompact(enterprise)],
  ]

  return (
    <Card>
      <CardHeader title="Capital structure" subtitle="Market cap plus debt, less cash, is enterprise value" />
      <dl className="mt-4 grid grid-cols-3 gap-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-500 font-medium">{label}</dt>
            <dd className="mt-1 text-[var(--fig-md)] num font-mono text-zinc-100">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
```

`AnalystRatingCard.jsx`:

```jsx
import { ANALYST_GRADES, analystRating } from '../../lib/analystRating'
import { ESTIMATE, NEGATIVE, POSITIVE, withAlpha } from '../../lib/charts'
import { fmtMonthYear } from '../../lib/format'
import { Card, CardHeader } from '../ui'
import AnalystCounts from './AnalystCounts'
import RatingGauge from './RatingGauge'

const GRADE_COLORS = [NEGATIVE, withAlpha(NEGATIVE, 0.55), ESTIMATE, withAlpha(POSITIVE, 0.55), POSITIVE]
const BEST_FIRST = ANALYST_GRADES.map(([key, label], index) => ({ key, label, color: GRADE_COLORS[index] })).reverse()

function monthSummary(month) {
  const counts = BEST_FIRST.map(({ key, label }) => `${month[key] || 0} ${label.toLowerCase()}`).join(', ')
  return `${fmtMonthYear(month.period)}: ${counts}`
}

function Trend({ history }) {
  const totals = history.map((month) => BEST_FIRST.reduce((sum, { key }) => sum + (month[key] || 0), 0))
  const tallest = Math.max(...totals, 1)

  return (
    <ol aria-label="Analyst ratings by month" className="mt-4 flex items-end justify-center gap-3 h-24">
      {history.map((month, index) => (
        <li key={month.period} aria-label={monthSummary(month)} className="flex h-full w-10 flex-col items-center justify-end gap-1">
          <span className="flex w-full flex-col overflow-hidden rounded-sm" style={{ height: `${(totals[index] / tallest) * 100}%` }}>
            {BEST_FIRST.map(({ key, color }) =>
              month[key] ? <span key={key} style={{ flexGrow: month[key], backgroundColor: color }} /> : null,
            )}
          </span>
          <span className="text-[var(--fig-2xs)] text-zinc-500 whitespace-nowrap">{fmtMonthYear(month.period)}</span>
        </li>
      ))}
    </ol>
  )
}

export default function AnalystRatingCard({ fundamentals }) {
  const rating = analystRating(fundamentals.recommendation)
  if (!rating) return null
  const history = fundamentals.recommendation_history ?? []

  return (
    <Card>
      <CardHeader
        title="Analyst rating"
        subtitle={rating.period ? `${rating.total} analysts · as of ${fmtMonthYear(rating.period)}` : `${rating.total} analysts`}
      />
      <div className="mt-3 mx-auto max-w-xs">
        <RatingGauge title="Analyst rating" fraction={rating.fraction} label={rating.label} />
        <AnalystCounts rows={rating.counts.map((row) => [row.label, row.count])} />
      </div>
      {history.length > 1 && <Trend history={history} />}
    </Card>
  )
}
```

`withAlpha(hex, alpha)` is the existing helper in `lib/charts.js`. If `RatingGauge.jsx` already builds its five segment colours the same way, export that array from `RatingGauge.jsx`'s source of truth or from `lib/charts.js` and import it here instead of repeating the list.

- [ ] **Step 5: Run and see them pass**

Run the four test files from Step 3 again. Expected: all pass.

- [ ] **Step 6: Write the failing Overview tests**

In `frontend/src/components/research/OverviewTab.test.jsx`, using the file's existing render helper and fixtures, add:

```jsx
  it('opens the company view with the key facts', () => {
    renderOverview({ fundamentals: { data: { available: true, market_cap: 4_976_177, country: 'US' }, isLoading: false } })

    expect(screen.getByText('Market cap')).toBeInTheDocument()
    expect(screen.getByText('Country')).toBeInTheDocument()
  })

  it('shows trailing performance from the full price history', () => {
    renderOverview({ allBars: risingBars(300) })

    expect(screen.getByRole('heading', { name: 'Performance' })).toBeInTheDocument()
    expect(screen.getByText('1Y')).toBeInTheDocument()
  })

  it('shows ownership, capital structure and the analyst rating when the data is there', () => {
    renderOverview({
      fundamentals: {
        isLoading: false,
        data: {
          available: true,
          shares_outstanding: 1000,
          free_float: 800,
          market_cap: 4_000_000,
          enterprise_value: 4_050_000,
          recommendation: { strong_buy: 5, buy: 5, hold: 2, sell: 0, strong_sell: 0, period: '2026-09-01' },
          recommendation_history: [],
        },
      },
    })

    expect(screen.getByText('Ownership')).toBeInTheDocument()
    expect(screen.getByText('Capital structure')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /analyst rating/i })).toBeInTheDocument()
  })

  it('shows none of the company cards for an ETF', () => {
    renderOverview({
      isEtf: true,
      allBars: risingBars(300),
      fundamentals: { isLoading: false, data: { available: true, market_cap: 100, shares_outstanding: 10, free_float: 8 } },
    })

    expect(screen.queryByText('Ownership')).not.toBeInTheDocument()
    expect(screen.queryByText('Market cap')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Performance' })).toBeInTheDocument()
  })

  it('shows none of the company cards while fundamentals are unavailable', () => {
    renderOverview({ fundamentals: { isLoading: false, data: { available: false } } })

    expect(screen.queryByText('Ownership')).not.toBeInTheDocument()
    expect(screen.queryByText('Capital structure')).not.toBeInTheDocument()
  })
```

Define `risingBars` at the top of the test file:

```jsx
const risingBars = (count) =>
  Array.from({ length: count }, (_, index) => {
    const day = new Date(Date.UTC(2026, 9, 9) - (count - 1 - index) * 86_400_000)
    const close = 100 + index
    return { date: day.toISOString().slice(0, 10), open: close, high: close, low: close, close, volume: 1000 }
  })
```

and make sure the file's render helper (name it `renderOverview` if it has another name, or adapt the calls) passes `allBars={[]}` by default.

- [ ] **Step 7: Run and see them fail**

Run: `npx vitest run src/components/research/OverviewTab.test.jsx`
Expected: the new tests fail.

- [ ] **Step 8: Wire the cards into `OverviewTab.jsx`**

Add the imports (`useMemo` from react, `trailingReturns`, `AnalystRatingCard`, `CapitalStructureCard`, `KeyFactsStrip`, `OwnershipCard`, `PerformanceTiles`), add `allBars = []` to the props, and inside the component compute:

```jsx
  const company = !isEtf && fundamentals?.data?.available ? fundamentals.data : null
  const returns = useMemo(() => trailingReturns(allBars), [allBars])
  const hasReturns = returns.some((row) => row.pct != null)
```

Change the returned layout to:

```jsx
    <div className="space-y-4">
      {position ? <PositionCard position={position} /> : null}

      {company && <KeyFactsStrip fundamentals={company} />}

      {hasReturns && (
        <Card>
          <CardHeader title="Performance" subtitle="Change in price up to the latest close" />
          <div className="mt-3 [&>ul]:grid-cols-6">
            <PerformanceTiles returns={returns} />
          </div>
        </Card>
      )}

      {isEtf ? <EtfNote /> : <SnapshotSection fundamentals={fundamentals} />}

      {company && (
        <div className="grid gap-4 lg:grid-cols-2">
          <OwnershipCard fundamentals={company} />
          <CapitalStructureCard fundamentals={company} />
        </div>
      )}
      {company && <AnalystRatingCard fundamentals={company} />}

      <ReferenceStrip symbol={symbol} details={details} isLoading={detailsLoading} />
      <BusinessSummaryCard note={note?.data} onSave={onSaveNote} />
      <RangeStatsCard bars={bars} range={range} />
      <ThesisAndRisksCard ... unchanged ... />
    </div>
```

Keep `ThesisAndRisksCard`'s existing props exactly as they are. `CardHeader` must render "Performance" as a heading for the test's role lookup. `PerformanceTiles` renders a three-column `ul`; the wrapper's `[&>ul]:grid-cols-6` puts the six tiles on one row here without changing the chart-page panel. If the two-card grid leaves a lone card looking stranded when the other renders nothing, that is acceptable.

- [ ] **Step 9: Run the frontend suite and lint**

Run: `npx vitest run && npx eslint .`
Expected: all pass (the Research page does not pass `allBars` yet; the default covers it).

- [ ] **Step 10: Commit**

```bash
git add -A frontend/src
git commit -m "feat(research): Overview gains key facts, performance, ownership, capital structure and the analyst gauge"
```

---

### Task 9: Earnings tab: forward quarters and an annual view (frontend)

**Files:**
- Create: `frontend/src/lib/epsSeries.js`, `frontend/src/lib/epsSeries.test.js`
- Modify: `frontend/src/components/research/EpsBarChart.jsx`, `frontend/src/components/research/EarningsTab.jsx`, `frontend/src/components/research/EarningsTab.test.jsx`

**Interfaces:**
- Consumes: the earnings payload's `history` and `upcoming` (Task 3); `useStatements` and the annual rows' `income.eps_diluted` (Tasks 2 and 4).
- Produces from `lib/epsSeries.js`: `quarterlyEpsRows(history, upcoming)` returning `[{ period, actual, estimate, surprise, forward }]` (reported quarters then upcoming ones, oldest first; `forward: true` and `actual: null` for upcoming), and `annualEpsRows(annual)` returning `[{ period: 'FY 2025', actual, estimate: null, surprise: null, forward: false }]` for the newest eight fiscal years that report diluted EPS.
- `EpsBarChart` gains nothing in its props; it reads `forward` on each row. `EarningsTab` no longer renders the margin trend (it moved to Financials in Task 6).

- [ ] **Step 1: Write the failing lib tests**

Create `frontend/src/lib/epsSeries.test.js`:

```js
import { describe, expect, it } from 'vitest'

import { annualEpsRows, quarterlyEpsRows } from './epsSeries'

const history = [
  { date: '2026-03-31', eps_actual: 0.91, eps_estimate: 0.96, eps_surprise_pct: -5.2 },
  { date: '2026-06-30', eps_actual: 0.99, eps_estimate: 0.96, eps_surprise_pct: 3.1 },
]
const upcoming = [
  { date: '2026-11-02', eps_estimate: 1.02 },
  { date: '2027-01-27', eps_estimate: 1.1 },
]

describe('quarterlyEpsRows', () => {
  it('puts reported quarters first and upcoming ones after', () => {
    const rows = quarterlyEpsRows(history, upcoming)

    expect(rows.map((row) => [row.period, row.actual, row.estimate, row.forward])).toEqual([
      ['2026-03', 0.91, 0.96, false],
      ['2026-06', 0.99, 0.96, false],
      ['2026-11', null, 1.02, true],
      ['2027-01', null, 1.1, true],
    ])
    expect(rows[0].surprise).toBe(-5.2)
    expect(rows[2].surprise).toBeNull()
  })

  it('leaves out an upcoming quarter with no estimate', () => {
    expect(quarterlyEpsRows(history, [{ date: '2026-11-02', eps_estimate: null }])).toHaveLength(2)
  })

  it('works without an upcoming list', () => {
    expect(quarterlyEpsRows(history, undefined)).toHaveLength(2)
    expect(quarterlyEpsRows(undefined, undefined)).toEqual([])
  })
})

describe('annualEpsRows', () => {
  const annual = Array.from({ length: 10 }, (_, index) => ({
    label: `FY ${2016 + index}`,
    income: index === 3 ? {} : { eps_diluted: 1 + index },
  }))

  it('lists diluted EPS for the newest eight years that report it', () => {
    const rows = annualEpsRows(annual)

    expect(rows).toHaveLength(8)
    expect(rows[0].period).toBe('FY 2017')
    expect(rows.at(-1)).toEqual({ period: 'FY 2025', actual: 10, estimate: null, surprise: null, forward: false })
    expect(rows.map((row) => row.period)).not.toContain('FY 2019')
  })

  it('is empty for a missing input', () => {
    expect(annualEpsRows(undefined)).toEqual([])
  })
})
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/lib/epsSeries.test.js`
Expected: fails to resolve `./epsSeries`.

- [ ] **Step 3: Implement `frontend/src/lib/epsSeries.js`**

```js
const ANNUAL_YEARS = 8

export function quarterlyEpsRows(history, upcoming) {
  const reported = (history ?? []).map((event) => ({
    period: event.date.slice(0, 7),
    actual: event.eps_actual,
    estimate: event.eps_estimate,
    surprise: event.eps_surprise_pct,
    forward: false,
  }))
  const scheduled = (upcoming ?? [])
    .filter((event) => event.eps_estimate != null)
    .map((event) => ({
      period: event.date.slice(0, 7),
      actual: null,
      estimate: event.eps_estimate,
      surprise: null,
      forward: true,
    }))
  return [...reported, ...scheduled]
}

export function annualEpsRows(annual) {
  return (annual ?? [])
    .filter((year) => year.income?.eps_diluted != null)
    .slice(-ANNUAL_YEARS)
    .map((year) => ({ period: year.label, actual: year.income.eps_diluted, estimate: null, surprise: null, forward: false }))
}
```

- [ ] **Step 4: Run and see them pass**

Run: `npx vitest run src/lib/epsSeries.test.js`
Expected: all pass.

- [ ] **Step 5: Write the failing tab tests**

In `frontend/src/components/research/EarningsTab.test.jsx`: the file mocks or passes `earnings` and `fundamentals`; it must now also mock `useStatements`. If the file does not yet have `vi.mock('../../api/queries')`, add it with `import * as queries from '../../api/queries'`, and in `beforeEach` set `queries.useStatements.mockReturnValue({ data: undefined, isLoading: false })`. Add `upcoming` to the fixture's earnings data, and add:

```jsx
  it('labels the quarters still to come as estimates', () => {
    renderTab({ upcoming: [{ date: '2026-11-02', eps_estimate: 1.02 }] })

    expect(screen.getByText(/1 upcoming quarter, estimate only/i)).toBeInTheDocument()
  })

  it('does not fetch statements until the annual view is chosen', async () => {
    renderTab()

    expect(queries.useStatements).toHaveBeenLastCalledWith('')

    await userEvent.click(screen.getByRole('button', { name: 'Annual' }))

    expect(queries.useStatements).toHaveBeenLastCalledWith('NVDA')
  })

  it('shows annual diluted EPS from the statements', async () => {
    queries.useStatements.mockReturnValue({
      isLoading: false,
      data: { available: true, annual: [{ label: 'FY 2024', income: { eps_diluted: 2.9 } }, { label: 'FY 2025', income: { eps_diluted: 3.4 } }], quarterly: [] },
    })
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Annual' }))

    expect(screen.getByText('Diluted EPS by fiscal year')).toBeInTheDocument()
  })

  it('says so when annual EPS is unavailable', async () => {
    queries.useStatements.mockReturnValue({ isLoading: false, data: { available: false } })
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Annual' }))

    expect(screen.getByText(/annual EPS is unavailable/i)).toBeInTheDocument()
  })

  it('no longer shows the margin trend', () => {
    renderTab()

    expect(screen.queryByText('Margin trend')).not.toBeInTheDocument()
  })
```

where `renderTab(extraEarnings)` renders `<EarningsTab symbol="NVDA" earnings={{ data: { ...baseEarnings, ...extraEarnings }, isLoading: false }} fundamentals={fundamentals} />` through the file's existing provider wrapper; reuse the helper the file already has and extend it. Delete any existing test asserting the margin trend on this tab.

- [ ] **Step 6: Run and see them fail**

Run: `npx vitest run src/components/research/EarningsTab.test.jsx`
Expected: the new tests fail.

- [ ] **Step 7: Mark forward quarters in `EpsBarChart.jsx`**

The chart already draws `estimate` and `actual` bars per row; a forward row has `actual: null`, so only its estimate bar appears. Shade the forward zone and say what it is:

- Import `ReferenceArea` from `recharts` and `TRACK` from `lib/charts`.
- Compute, at the top of the component after the empty check:

```jsx
  const forward = data.filter((row) => row.forward)
```

- Inside `<BarChart>`, before the bars:

```jsx
            {forward.length > 0 && (
              <ReferenceArea x1={forward[0].period} x2={forward.at(-1).period} fill={TRACK} strokeOpacity={0} />
            )}
```

- Under the chart `div`, inside the `Card`:

```jsx
      {forward.length > 0 && (
        <p className="mt-2 text-[var(--fig-2xs)] text-zinc-500">
          {forward.length} upcoming {forward.length === 1 ? 'quarter' : 'quarters'}, estimate only.
        </p>
      )}
```

- The legend's "Beat" and "Miss" swatches make no sense for a series with no estimates (the annual view): render those two legend entries and the "Estimate" entry only when `data.some((row) => row.estimate != null)`.

- [ ] **Step 8: Rework `EarningsTab.jsx`**

- Add `useState` and `useStatements` imports, `TBtn` to the `ui` import, and `annualEpsRows`, `quarterlyEpsRows` from `lib/epsSeries`. Remove the `QuarterlyTrendsChart` and `FundamentalsGate` imports and the `<FundamentalsGate title="Margin trend" ...>` block.
- At the top of the component (before the early returns, so the hooks are unconditional):

```jsx
  const [view, setView] = useState('quarterly')
  const statements = useStatements(view === 'annual' ? symbol : '')
```

- Replace the `epsRows` constant and the `<EpsBarChart ... />` element with:

```jsx
  const annualRows = annualEpsRows(statements.data?.available ? statements.data.annual : [])
  const viewToggle = (
    <div className="flex items-center gap-0.5">
      {[
        ['quarterly', 'Quarterly'],
        ['annual', 'Annual'],
      ].map(([key, label]) => (
        <TBtn key={key} active={view === key} onClick={() => setView(key)}>
          {label}
        </TBtn>
      ))}
    </div>
  )
```

and in the JSX:

```jsx
      <div className="flex justify-end">{viewToggle}</div>
      {view === 'quarterly' ? (
        <EpsBarChart
          title="EPS: actual vs. estimate"
          subtitle="Reported quarters, labelled with the surprise vs. consensus"
          data={quarterlyEpsRows(data.history, data.upcoming)}
          format={(v) => fmtNum(v, 2)}
        />
      ) : statements.isLoading ? (
        <Card>
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : annualRows.length > 0 ? (
        <EpsBarChart
          title="Diluted EPS by fiscal year"
          subtitle="From the annual reports"
          data={annualRows}
          format={(v) => fmtNum(v, 2)}
        />
      ) : (
        <Card>
          <p className="text-[var(--fig-xs)] text-zinc-500">Annual EPS is unavailable for {symbol}.</p>
        </Card>
      )}
```

`EpsBarChart` colours a bar by `surprise`; with `surprise: null` it uses the neutral "reported" colour, which is what the annual view wants.

- [ ] **Step 9: Run the frontend suite and lint**

Run: `npx vitest run && npx eslint .`
Expected: all pass. `Research.test.jsx` mocks `../api/queries` wholesale, so add `queries.useStatements.mockReturnValue({ ...idle, data: { available: false } })` to its setup now.

- [ ] **Step 10: Commit**

```bash
git add -A frontend/src
git commit -m "feat(research): Earnings chart shows upcoming quarters and an annual view"
```

---

### Task 10: Research page tab list and wiring (frontend)

**Files:**
- Modify: `frontend/src/pages/Research.jsx`, `frontend/src/pages/Research.test.jsx`

**Interfaces:**
- Consumes: `FinancialsTab` (Task 6), `StatisticsTab` (Task 7), `OverviewTab`'s `allBars` prop (Task 8).
- Produces: tab keys `overview`, `financials`, `statistics`, `peers`, `earnings`, `news`, `guide`; `?tab=valuation` opens Statistics.

- [ ] **Step 1: Write the failing page tests**

In `frontend/src/pages/Research.test.jsx`, make sure the setup stubs `queries.useStatements` (added in Task 9). Rename the existing "shows the valuation tab…" test to use the Statistics tab (click the tab named "Statistics"), and update "hides the Valuation, Peers and Earnings tabs for an ETF" to assert Financials, Statistics, Peers and Earnings are all absent. Add:

```jsx
  it('lists the tabs in reading order', () => {
    renderPage('/research?symbol=NVDA')

    const tabs = within(screen.getByRole('tablist', { name: 'Instrument sections' })).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Overview', 'Financials', 'Statistics', 'Peers', 'Earnings', 'News', 'Guide'])
  })

  it('opens Statistics for the old ?tab=valuation link', () => {
    renderPage('/research?symbol=NVDA&tab=valuation')

    expect(screen.getByRole('tab', { name: 'Statistics' })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens the Financials tab from ?tab=financials and asks for the statements', () => {
    renderPage('/research?symbol=NVDA&tab=financials')

    expect(screen.getByRole('tab', { name: 'Financials' })).toHaveAttribute('aria-selected', 'true')
    expect(queries.useStatements).toHaveBeenCalledWith('NVDA')
  })

  it('does not ask for statements on the other tabs', () => {
    renderPage('/research?symbol=NVDA')

    expect(queries.useStatements).not.toHaveBeenCalledWith('NVDA')
  })

  it('falls back to Overview when ?tab=financials is opened for an ETF', () => {
    renderEtfPage('/research?symbol=IWDA&tab=financials')

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  })
```

Use the file's own render helper and ETF setup in place of `renderPage` / `renderEtfPage` (the existing "falls back to Overview when a stale ?tab does not apply to an ETF" test shows how the ETF case is set up), and import `within` if it is not imported. Check how `TabButton` marks the active tab (`aria-selected`) in `components/ui.jsx` and match it.

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/pages/Research.test.jsx`
Expected: the new tests fail.

- [ ] **Step 3: Rewire `pages/Research.jsx`**

- Import `FinancialsTab`; the `StatisticsTab` import exists since Task 7.
- Replace the `TABS` constant and add the alias map below it:

```jsx
const TABS = [
  ['overview', 'Overview'],
  ['financials', 'Financials', { equityOnly: true }],
  ['statistics', 'Statistics', { equityOnly: true }],
  ['peers', 'Peers', { equityOnly: true }],
  ['earnings', 'Earnings', { equityOnly: true }],
  ['news', 'News'],
  ['guide', 'Guide'],
]

const TAB_ALIASES = { valuation: 'statistics' }
```

- Replace the `requestedTab` line with:

```jsx
  const rawTab = params.get('tab')
  const requestedTab = TAB_ALIASES[rawTab] ?? rawTab
```

- Take `allBars` from the `useChartData` result (it already returns it) and pass `allBars={allBars}` to `<OverviewTab>`.
- Replace the `tab === 'valuation'` line with:

```jsx
              {tab === 'financials' ? <FinancialsTab symbol={symbol} fundamentals={fundamentals} /> : null}
              {tab === 'statistics' ? <StatisticsTab fundamentals={fundamentals} /> : null}
```

Search the frontend for other producers of the old key: `grep -rn "tab=valuation\|'valuation'" frontend/src`. Any `researchHref(symbol, 'valuation', ...)` caller becomes `'statistics'`; leave the alias test as the only remaining mention.

- [ ] **Step 4: Run the frontend suite, lint and build**

Run from `frontend/`: `npx vitest run && npx eslint . && npm run build`
Expected: all pass, no lint output, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src
git commit -m "feat(research): tab list becomes Overview, Financials, Statistics, Peers, Earnings, News, Guide"
```

---

### Task 11: Mini financials in the symbol panel, project notes, visual check

**Files:**
- Create: `frontend/src/components/research/MiniFinancials.jsx`, `frontend/src/components/research/MiniFinancials.test.jsx`
- Modify: `frontend/src/components/research/SymbolPanel.jsx`, `frontend/src/components/research/SymbolPanel.test.jsx`, `frontend/src/pages/ResearchChart.jsx`, `frontend/src/pages/ResearchChart.test.jsx`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `useStatements`; `STATEMENT_SERIES`; `fmtStatement`; `researchHref(symbol, tab, instrument)` from `lib/research.js`.
- Produces: `<MiniFinancials annual={annualRows} />` (bare; nothing with fewer than two years that report revenue). `SymbolPanel` gains a `financialsHref` prop.

- [ ] **Step 1: Write the failing component test**

Create `frontend/src/components/research/MiniFinancials.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import MiniFinancials from './MiniFinancials'

const year = (fiscal_year, revenue, net_income) => ({
  label: `FY ${fiscal_year}`,
  fiscal_year,
  income: { ...(revenue == null ? {} : { revenue }), ...(net_income == null ? {} : { net_income }) },
})

describe('MiniFinancials', () => {
  it('draws the newest five years, oldest first, with a text alternative', () => {
    const annual = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y, index) => year(y, (index + 1) * 10e9, (index + 1) * 2e9))
    render(<MiniFinancials annual={annual} />)

    const years = screen.getAllByRole('listitem')
    expect(years).toHaveLength(5)
    expect(within(years[0]).getByText('2021')).toBeInTheDocument()
    expect(years.at(-1)).toHaveAccessibleName('FY 2025: revenue 70.00B, net income 14.00B')
  })

  it('draws a loss below the baseline without breaking the layout', () => {
    render(<MiniFinancials annual={[year(2024, 10e9, -2e9), year(2025, 12e9, 1e9)]} />)

    expect(screen.getAllByRole('listitem')[0]).toHaveAccessibleName('FY 2024: revenue 10.00B, net income -2.00B')
  })

  it('names a year without net income by its revenue alone', () => {
    render(<MiniFinancials annual={[year(2024, 10e9, null), year(2025, 12e9, 1e9)]} />)

    expect(screen.getAllByRole('listitem')[0]).toHaveAccessibleName('FY 2024: revenue 10.00B')
  })

  it('renders nothing with fewer than two years of revenue', () => {
    const { container } = render(<MiniFinancials annual={[year(2025, 12e9, 1e9), year(2024, null, 1e9)]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run src/components/research/MiniFinancials.test.jsx`
Expected: fails to resolve the component.

- [ ] **Step 3: Implement `MiniFinancials.jsx`**

```jsx
import { STATEMENT_SERIES } from '../../lib/charts'
import { fmtStatement } from '../../lib/statements'

const YEARS = 5
const MIN_YEARS = 2
const SERIES = [
  ['revenue', 'revenue'],
  ['net_income', 'net income'],
]

function summary(year) {
  const parts = SERIES.filter(([key]) => year.income[key] != null).map(([key, name]) => `${name} ${fmtStatement(year.income[key])}`)
  return `${year.label}: ${parts.join(', ')}`
}

export default function MiniFinancials({ annual }) {
  const years = (annual ?? []).filter((year) => year.income?.revenue != null).slice(-YEARS)
  if (years.length < MIN_YEARS) return null

  const values = years.flatMap((year) => SERIES.map(([key]) => year.income[key] ?? 0))
  const high = Math.max(0, ...values)
  const low = Math.min(0, ...values)
  const span = high - low || 1
  const baseline = (high / span) * 100

  return (
    <div>
      <ol className="relative flex h-20 gap-2">
        {years.map((year) => (
          <li key={year.label} aria-label={summary(year)} className="relative flex-1">
            <div className="absolute inset-0 flex items-stretch justify-center gap-0.5">
              {SERIES.map(([key]) => {
                const value = year.income[key]
                if (value == null) return <span key={key} className="w-2.5" />
                const size = (Math.abs(value) / span) * 100
                return (
                  <span key={key} className="relative w-2.5">
                    <span
                      className="absolute left-0 right-0 rounded-sm"
                      style={{
                        top: `${value >= 0 ? baseline - size : baseline}%`,
                        height: `${Math.max(size, 1)}%`,
                        backgroundColor: STATEMENT_SERIES[key],
                      }}
                    />
                  </span>
                )
              })}
            </div>
            <span className="absolute -bottom-4 left-0 right-0 text-center text-[var(--fig-2xs)] text-zinc-500">
              {String(year.fiscal_year)}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-6 flex justify-center gap-3 text-[var(--fig-2xs)] text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATEMENT_SERIES.revenue }} /> Revenue
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: STATEMENT_SERIES.net_income }} /> Net income
        </span>
      </p>
    </div>
  )
}
```

The legend is a paragraph, not a list, so the years are the only list items on the block.

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run src/components/research/MiniFinancials.test.jsx`
Expected: all pass.

- [ ] **Step 5: Write the failing panel and page tests**

In `SymbolPanel.test.jsx` (it mocks `../../api/queries`; stub `queries.useStatements.mockReturnValue({ data: undefined, isLoading: false })` in `beforeEach`), add:

```jsx
  const annual = [
    { label: 'FY 2024', fiscal_year: 2024, income: { revenue: 10e9, net_income: 2e9 } },
    { label: 'FY 2025', fiscal_year: 2025, income: { revenue: 12e9, net_income: 3e9 } },
  ]

  it('shows the mini financials with a link to the Financials tab', () => {
    queries.useStatements.mockReturnValue({ isLoading: false, data: { available: true, annual, quarterly: [] } })
    renderPanel({ financialsHref: '/research?symbol=NVDA&tab=financials' })

    expect(screen.getByRole('heading', { name: 'Financials' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /more financials/i })).toHaveAttribute('href', '/research?symbol=NVDA&tab=financials')
  })

  it('leaves the financials block out when statements are unavailable', () => {
    queries.useStatements.mockReturnValue({ isLoading: false, data: { available: false } })
    renderPanel()

    expect(screen.queryByRole('heading', { name: 'Financials' })).not.toBeInTheDocument()
  })

  it('asks for no statements for an ETF or an unresolved symbol', () => {
    renderPanel({ instrument: { uic: 300, asset_type: 'Etf' } })
    expect(queries.useStatements).toHaveBeenLastCalledWith('')

    renderPanel({ instrument: null })
    expect(queries.useStatements).toHaveBeenLastCalledWith('')
  })
```

using the file's existing render helper in place of `renderPanel` (extend it to accept `financialsHref`), and the ETF instrument shape the file already uses.

In `ResearchChart.test.jsx`, stub `queries.useStatements` in the setup and add:

```jsx
  it('hands the panel a link to the Financials tab for the same instrument', () => {
    queries.useStatements.mockReturnValue({
      isLoading: false,
      data: { available: true, quarterly: [], annual: [
        { label: 'FY 2024', fiscal_year: 2024, income: { revenue: 10e9, net_income: 2e9 } },
        { label: 'FY 2025', fiscal_year: 2025, income: { revenue: 12e9, net_income: 3e9 } },
      ] },
    })
    renderPage('/research/chart?symbol=NVDA')

    expect(screen.getByRole('link', { name: /more financials/i }).getAttribute('href')).toContain('tab=financials')
  })
```

with the file's own render helper.

- [ ] **Step 6: Run and see them fail**

Run: `npx vitest run src/components/research/SymbolPanel.test.jsx src/pages/ResearchChart.test.jsx`
Expected: the new tests fail.

- [ ] **Step 7: Wire the block into the panel**

In `SymbolPanel.jsx`:
- Import `useStatements` beside `useFundamentals`, and `MiniFinancials`.
- Add `financialsHref` to the props.
- After the `fundamentals` line: `const statements = useStatements(hasCompany ? symbol : '')` and `const annual = hasCompany && statements.data?.available ? statements.data.annual : []` and `const hasFinancials = annual.filter((year) => year.income?.revenue != null).length >= 2`.
- Add `hasFinancials` to the `hasAnything` expression.
- After the Earnings section and before the loading skeleton, add:

```jsx
      {hasFinancials && (
        <Section
          title="Financials"
          note={financialsHref ? <Link to={financialsHref} className="hover:text-zinc-300">More financials →</Link> : null}
        >
          <MiniFinancials annual={annual} />
        </Section>
      )}
```

In `pages/ResearchChart.jsx`, pass `financialsHref={researchHref(symbol, 'financials', instrument)}` to `<SymbolPanel>`.

- [ ] **Step 8: Run the frontend suite, lint and build**

Run from `frontend/`: `npx vitest run && npx eslint . && npm run build`
Expected: all pass, no lint output, build succeeds.

- [ ] **Step 9: Record the decisions in `AGENTS.md`**

Append to the end of `AGENTS.md`, as one paragraph in the "Decided" style:

```markdown
**Company statements are mapped, not passed through.** `research/statements.py` reads
Finnhub's `/stock/financials-reported` (SEC XBRL) and maps each company's own concepts
onto one fixed row set, trying an ordered list of candidates per row and stripping the
`us-gaap_` prefix first, because filings before about 2014 carry none. A row nobody
matched is left out, never zero. A 10-Q's income and cash-flow figures are year-to-date,
so a quarter is its filing minus the previous one, and the fourth quarter is the annual
report minus the third; a quarter whose predecessor was never filed is dropped. Per-share
figures are annual only, since a year-to-date EPS cannot be subtracted. `GET
/api/research/statements/<symbol>/` follows the fundamentals contract (200 with
`available`, 24h cache, `research.fundamentals` scope) and costs two Finnhub calls on a
miss. The Research tabs are Overview, Financials, Statistics, Peers, Earnings, News and
Guide; `?tab=valuation` is an alias for Statistics. Annual ratio series arrive as
fractions and are stored as percent, to match the TTM figures beside them. The free key
returns four months of analyst recommendations, so the "trend" is four columns.
```

- [ ] **Step 10: Run the backend suite one last time**

Run from `backend/`: `python manage.py test research`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add -A frontend/src AGENTS.md
git commit -m "feat(research): mini financials in the chart page's symbol panel; record the statements decisions"
```

- [ ] **Step 12: Screenshot review (done by the controller, not an implementer)**

With Vite on port 5199 in the worktree and every `http://localhost:8000/**` request stubbed through Playwright (the phase 1 harness), capture at 1440px and 390px: `/research?symbol=NVDA` on each of Overview, Financials (annual and quarterly, each statement), Statistics and Earnings (quarterly and annual); the same for a bank-shaped fixture with no gross profit or operating income; an ETF; and `/research/chart?symbol=NVDA` with the panel scrolled to the Financials block. Check: no horizontal page overflow, the statement table scrolls inside its card with the first column pinned, no console errors, no empty cards.

---

## Self-Review

**Spec coverage (Phase 2):**
- Tab list Overview, Financials, Statistics, Peers, Earnings, News, Guide: Task 10.
- Overview key facts strip, performance tiles, ownership, capital structure, analyst gauge with monthly trend; the gauge replaces the bar that leaves Valuation: Tasks 7 and 8.
- Statistics renamed with `?tab=valuation` alias, by-year table grouped as valuation, profitability, liquidity, solvency with a Current column, ratio history chart: Tasks 3, 7, 10.
- Financials: multi-year bar chart, three statement tables with year-on-year change under headline rows, annual/quarterly toggle, revenue-to-profit waterfall, cash flow trend and margin trend moved in: Tasks 1, 2, 4, 5, 6, 9.
- Earnings keeps its cards; EPS chart gains forward quarters as a shaded zone and an annual/quarterly toggle: Tasks 3, 9.
- Symbol panel gains the mini financials block with a "More financials" link to `?tab=financials`: Task 11.
- Backend endpoint under the fundamentals contract, mapping concepts, deriving the fourth quarter, omitting unreported rows: Tasks 1, 2.
- Fundamentals payload gains `free_float`, `ipo_date`, `website`, `country`, `enterprise_value`, the recommendation history and the wider annual ratio series: Task 3.

**Deviations from the spec, on purpose:**
- Capital structure shows market cap, net debt (or net cash) and enterprise value, derived as enterprise value minus market cap, instead of separate debt and cash figures. Separate figures would make Overview fetch the statements; this keeps Overview on the one fundamentals request.
- The recommendation "monthly trend" is four months, because that is all the free key returns.
- Quarterly statements carry no EPS or share count (see the provider facts).

**Review Focus coverage:** (1) bank shape: Task 1 `test_omits_a_row_the_company_does_not_report`, Task 4 waterfall "no subtotals", Task 5 legend test. (2) fiscal years: Task 1 `test_uses_the_fiscal_year_in_the_label`, Task 4 `priorYearPeriod` tests. (3) missing 10-Q: Task 1 `test_a_quarter_after_a_missing_filing_is_dropped`, Task 4 "returns null when that period was never filed". (4) losses: Task 4 `changePct` negative base and waterfall net loss, Task 6 bars-inside-the-track, Task 11 loss below the baseline. (5) statements unavailable: Task 2 view tests, Task 6 unavailable and fundamentals-still-shown tests, Task 11 panel test, Task 8 unavailable-fundamentals test.
