from django.test import TestCase, SimpleTestCase

from . import finnhub
from .statement_shaping import to_annual

SAMPLE_PROFILE = {
    'name': 'Apple Inc',
    'exchange': 'NASDAQ',
    'finnhubIndustry': 'Technology',
    'logo': 'https://example.com/aapl.png',
    'marketCapitalization': 3_100_000.0,
    'shareOutstanding': 15_200.0,
}

SAMPLE_FINANCIALS = {
    'metric': {
        'peNormalizedAnnual': 32.1,
        'psTTM': 8.4,
        'pbAnnual': 48.2,
        'epsGrowth5Y': 12.5,
        'dividendYieldIndicatedAnnual': 0.44,
        'epsInclExtraItemsTTM': 6.13,
        '52WeekHigh': 260.1,
        '52WeekLow': 164.08,
        'roeTTM': 147.2,
        'netProfitMarginTTM': 26.3,
        'grossMarginTTM': 46.2,
        'beta': 1.24,
        'forwardPE': 28.5,
        'evEbitdaTTM': 22.3,
        'evRevenueTTM': 9.1,
        'currentRatioAnnual': 0.98,
        'roaTTM': 30.2,
        'roiTTM': 65.4,
        'dividendGrowthRate5Y': 5.1,
        'monthToDatePriceReturnDaily': 2.4,
        'yearToDatePriceReturnDaily': 18.7,
        '52WeekPriceReturnDaily': 31.2,
        'revenueGrowthTTMYoy': 14.2,
        'epsGrowthTTMYoy': 32.6,
        'revenueGrowth3Y': 1.8,
        'revenueGrowth5Y': 8.7,
        'epsGrowth3Y': 6.9,
        'operatingMarginTTM': 33.2,
        'operatingMargin5Y': 30.7,
        'grossMargin5Y': 44.5,
        'netProfitMargin5Y': 25.5,
        'totalDebt/totalEquityQuarterly': 0.78,
        'longTermDebt/equityQuarterly': 0.66,
        'netInterestCoverageTTM': 622.5,
        'quickRatioQuarterly': 0.93,
    }
}

SAMPLE_RECOMMENDATION = [
    {'buy': 20, 'hold': 8, 'period': '2026-09-01', 'sell': 1, 'strongBuy': 12, 'strongSell': 0},
    {'buy': 18, 'hold': 9, 'period': '2026-08-01', 'sell': 2, 'strongBuy': 11, 'strongSell': 0},
]

SAMPLE_EARNINGS = [
    {'period': '2026-06-30', 'actual': 1.65, 'estimate': 1.58, 'surprisePercent': 4.43},
    {'period': '2026-03-31', 'actual': 1.52, 'estimate': 1.5, 'surprisePercent': 1.33},
]


class FundamentalsShapingTest(TestCase):
    def test_shapes_the_combined_payload(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS)

        self.assertEqual(result['name'], 'Apple Inc')
        self.assertEqual(result['market_cap'], 3_100_000.0)
        self.assertEqual(result['pe_ratio'], 32.1)
        self.assertEqual(result['week52_high'], 260.1)
        self.assertEqual(result['recommendation'], {
            'strong_buy': 12, 'buy': 20, 'hold': 8, 'sell': 1, 'strong_sell': 0, 'period': '2026-09-01',
        })

    def test_eps_history_is_oldest_first(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS)

        self.assertEqual([row['period'] for row in result['eps_history']], ['2026-03-31', '2026-06-30'])

    def test_peg_ratio_is_computed_from_pe_and_five_year_eps_growth(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS)

        self.assertAlmostEqual(result['peg_ratio'], 32.1 / 12.5, places=2)

    def test_a_metric_the_free_tier_does_not_return_is_none_not_zero(self):
        thin_financials = {'metric': {'peNormalizedAnnual': 32.1}}

        result = finnhub.to_fundamentals(SAMPLE_PROFILE, thin_financials, [], [])

        self.assertIsNone(result['dividend_yield'])
        self.assertIsNone(result['peg_ratio'])
        self.assertIsNone(result['recommendation'])
        self.assertEqual(result['eps_history'], [])
        self.assertIsNone(result['beta'])

    def test_shapes_the_extended_ratio_and_price_return_fields(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS)

        self.assertEqual(result['beta'], 1.24)
        self.assertEqual(result['forward_pe'], 28.5)
        self.assertEqual(result['ev_ebitda'], 22.3)
        self.assertEqual(result['ev_revenue'], 9.1)
        self.assertEqual(result['current_ratio'], 0.98)
        self.assertEqual(result['roa'], 30.2)
        self.assertEqual(result['roi'], 65.4)
        self.assertEqual(result['dividend_growth_5y'], 5.1)
        self.assertEqual(result['price_return_1m'], 2.4)
        self.assertEqual(result['price_return_ytd'], 18.7)
        self.assertEqual(result['price_return_1y'], 31.2)

    def test_shapes_the_growth_and_leverage_fields(self):
        result = finnhub.to_fundamentals(
            SAMPLE_PROFILE, SAMPLE_FINANCIALS, SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS
        )
        self.assertEqual(result['revenue_growth_ttm_yoy'], 14.2)
        self.assertEqual(result['eps_growth_ttm_yoy'], 32.6)
        self.assertEqual(result['revenue_growth_3y'], 1.8)
        self.assertEqual(result['revenue_growth_5y'], 8.7)
        self.assertEqual(result['eps_growth_3y'], 6.9)
        self.assertEqual(result['operating_margin_ttm'], 33.2)
        self.assertEqual(result['operating_margin_5y'], 30.7)
        self.assertEqual(result['gross_margin_5y'], 44.5)
        self.assertEqual(result['net_margin_5y'], 25.5)
        self.assertEqual(result['debt_to_equity'], 0.78)
        self.assertEqual(result['long_term_debt_to_equity'], 0.66)
        self.assertEqual(result['interest_coverage'], 622.5)
        self.assertEqual(result['quick_ratio'], 0.93)

    def test_growth_and_leverage_fields_absent_from_the_free_tier_are_none(self):
        result = finnhub.to_fundamentals(
            SAMPLE_PROFILE, {'metric': {'peNormalizedAnnual': 32.1}},
            SAMPLE_RECOMMENDATION, SAMPLE_EARNINGS,
        )
        self.assertIsNone(result['revenue_growth_ttm_yoy'])
        self.assertIsNone(result['debt_to_equity'])
        self.assertIsNone(result['interest_coverage'])

    def test_cache_key_carries_the_shape_version(self):
        self.assertEqual(finnhub._cache_key('AAPL'), 'research:fundamentals:v7:AAPL')


SAMPLE_SERIES = {
    'annual': {
        'pe': [
            {'period': '2026-09-30', 'v': 34.0},
            {'period': '2025-09-30', 'v': 28.0},
            {'period': '2024-09-30', 'v': 24.0},
        ],
        'ps': [
            {'period': '2026-09-30', 'v': 10.0},
            {'period': '2025-09-30', 'v': 8.0},
        ],
        'pb': [],
    },
    'quarterly': {
        'eps': [
            {'period': '2026-06-30', 'v': 1.65}, {'period': '2026-03-31', 'v': 1.52},
            {'period': '2025-12-31', 'v': 1.48}, {'period': '2025-09-30', 'v': 1.40},
            {'period': '2025-06-30', 'v': 1.30}, {'period': '2025-03-31', 'v': 1.20},
            {'period': '2024-12-31', 'v': 1.15}, {'period': '2024-09-30', 'v': 1.10},
            {'period': '2024-06-30', 'v': 1.00}, {'period': '2024-03-31', 'v': 0.95},
        ],
        'salesPerShare': [
            {'period': '2026-06-30', 'v': 12.0}, {'period': '2026-03-31', 'v': 11.4},
            {'period': '2025-12-31', 'v': 11.0}, {'period': '2025-09-30', 'v': 10.6},
            {'period': '2025-06-30', 'v': 10.0}, {'period': '2025-03-31', 'v': 9.6},
            {'period': '2024-12-31', 'v': 9.3}, {'period': '2024-09-30', 'v': 9.0},
            {'period': '2024-06-30', 'v': 8.5}, {'period': '2024-03-31', 'v': 8.2},
        ],
        'grossMargin': [
            {'period': '2026-06-30', 'v': 46.0}, {'period': '2026-03-31', 'v': 45.5},
            {'period': '2025-06-30', 'v': 44.0},
        ],
        'netMargin': [
            {'period': '2026-06-30', 'v': 26.0}, {'period': '2026-03-31', 'v': 25.0},
        ],
        'operatingMargin': [
            {'period': '2026-06-30', 'v': 31.0}, {'period': '2026-03-31', 'v': 30.0},
            {'period': '2025-06-30', 'v': 28.5},
        ],
    },
}


class ValuationHistoryTest(TestCase):
    def test_series_stats_reduces_a_named_annual_series(self):
        stats = finnhub._series_stats(SAMPLE_SERIES['annual'], 'pe')
        self.assertEqual(
            stats, {'latest': 34.0, 'min': 24.0, 'median': 28.0, 'max': 34.0, 'n': 3}
        )

    def test_series_stats_is_none_for_an_empty_or_missing_series(self):
        self.assertIsNone(finnhub._series_stats(SAMPLE_SERIES['annual'], 'pb'))
        self.assertIsNone(finnhub._series_stats(SAMPLE_SERIES['annual'], 'evEbitda'))

    def test_valuation_history_is_built_from_series_annual(self):
        financials = {**SAMPLE_FINANCIALS, 'series': SAMPLE_SERIES}
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, financials, [], [])
        self.assertEqual(result['valuation_history']['pe']['median'], 28.0)
        self.assertIn('ps', result['valuation_history'])
        self.assertNotIn('pb', result['valuation_history'])
        self.assertNotIn('ev_ebitda', result['valuation_history'])

    def test_valuation_history_is_absent_without_a_series_block(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, [], [])
        self.assertNotIn('valuation_history', result)


RAW_NEWS_ROW = {
    'category': 'company', 'datetime': 1_760_000_000, 'headline': 'Apple ships a thing',
    'id': 7, 'image': 'https://example.com/x.png', 'related': 'AAPL',
    'source': 'Reuters', 'summary': 'A short summary.', 'url': 'https://example.com/story',
}


class CompanyNewsShapingTest(TestCase):
    def test_shapes_a_row_and_drops_the_image(self):
        item = finnhub._to_news_item(RAW_NEWS_ROW)
        self.assertEqual(item['id'], 7)
        self.assertEqual(item['headline'], 'Apple ships a thing')
        self.assertEqual(item['source'], 'Reuters')
        self.assertEqual(item['summary'], 'A short summary.')
        self.assertEqual(item['url'], 'https://example.com/story')
        self.assertNotIn('image', item)
        self.assertEqual(item['datetime'], '2025-10-09T08:53:20+00:00')  # epoch -> ISO (UTC)

    def test_a_row_without_a_timestamp_has_a_none_datetime(self):
        item = finnhub._to_news_item({k: v for k, v in RAW_NEWS_ROW.items() if k != 'datetime'})
        self.assertIsNone(item['datetime'])


class QuarterlyTrendsTest(TestCase):
    def test_builds_oldest_first_rows_aligned_on_eps_and_revenue_proxy(self):
        financials = {**SAMPLE_FINANCIALS, 'series': SAMPLE_SERIES}
        rows = finnhub._quarterly_trends(financials)
        self.assertEqual(rows[0]['period'], '2024-03-31')
        self.assertEqual(rows[-1]['period'], '2026-06-30')
        self.assertEqual(rows[-1]['eps'], 1.65)
        self.assertEqual(rows[-1]['revenue_per_share'], 12.0)

    def test_keeps_the_row_when_a_margin_is_missing_at_that_period(self):
        financials = {**SAMPLE_FINANCIALS, 'series': SAMPLE_SERIES}
        rows = finnhub._quarterly_trends(financials)
        by_period = {r['period']: r for r in rows}
        self.assertIsNone(by_period['2024-03-31']['gross_margin'])
        self.assertEqual(by_period['2026-06-30']['gross_margin'], 46.0)

    def test_drops_a_period_missing_either_eps_or_revenue_proxy(self):
        series = {
            'quarterly': {
                'eps': SAMPLE_SERIES['quarterly']['eps'] + [{'period': '2023-12-31', 'v': 0.9}],
                'salesPerShare': SAMPLE_SERIES['quarterly']['salesPerShare'],  # no 2023-12-31 entry
            }
        }
        financials = {**SAMPLE_FINANCIALS, 'series': series}
        rows = finnhub._quarterly_trends(financials)
        self.assertNotIn('2023-12-31', [r['period'] for r in rows])

    def test_caps_at_the_trend_point_limit(self):
        eps = [{'period': f'{2020 + i // 4}-{["03", "06", "09", "12"][i % 4]}-28', 'v': 1.0 + i * 0.01}
               for i in range(20)]
        sales = [{'period': row['period'], 'v': 8.0 + i * 0.1} for i, row in enumerate(eps)]
        financials = {**SAMPLE_FINANCIALS, 'series': {'quarterly': {'eps': eps, 'salesPerShare': sales}}}
        rows = finnhub._quarterly_trends(financials)
        self.assertEqual(len(rows), finnhub.QUARTERLY_TREND_POINTS)

    def test_none_below_the_minimum_point_count(self):
        financials = {
            **SAMPLE_FINANCIALS,
            'series': {'quarterly': {
                'eps': SAMPLE_SERIES['quarterly']['eps'][:5],
                'salesPerShare': SAMPLE_SERIES['quarterly']['salesPerShare'][:5],
            }},
        }
        self.assertIsNone(finnhub._quarterly_trends(financials))

    def test_none_without_a_quarterly_series_block(self):
        self.assertIsNone(finnhub._quarterly_trends(SAMPLE_FINANCIALS))

    def test_to_fundamentals_includes_quarterly_trends_when_available(self):
        financials = {**SAMPLE_FINANCIALS, 'series': SAMPLE_SERIES}
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, financials, [], [])
        self.assertEqual(len(result['quarterly_trends']), 10)

    def test_to_fundamentals_omits_quarterly_trends_when_absent(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, [], [])
        self.assertNotIn('quarterly_trends', result)


def _reported_entry(year, end_date, op_cf=None, capex=None, cash=None, debt_rows=None, form='10-K'):
    cf = []
    if op_cf is not None:
        cf.append({'concept': 'us-gaap_NetCashProvidedByUsedInOperatingActivities', 'value': op_cf})
    if capex is not None:
        cf.append({'concept': 'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment', 'value': capex})
    bs = []
    if cash is not None:
        bs.append({'concept': 'us-gaap_CashAndCashEquivalentsAtCarryingValue', 'value': cash})
    for concept, value in (debt_rows or {}).items():
        bs.append({'concept': concept, 'value': value})
    return {'year': year, 'form': form, 'endDate': end_date, 'report': {'bs': bs, 'cf': cf}}


SAMPLE_REPORTED = {
    'data': [
        _reported_entry(2025, '2025-09-27', op_cf=110, capex=10, cash=30,
                         debt_rows={'us-gaap_LongTermDebtNoncurrent': 80}),
        _reported_entry(2024, '2024-09-28', op_cf=100, capex=9, cash=25,
                         debt_rows={'us-gaap_LongTermDebtNoncurrent': 90}),
        # A 10-Q in between the annual filings - excluded from the trend.
        _reported_entry(2025, '2025-03-28', op_cf=50, capex=5, cash=28, form='10-Q'),
    ],
}


class CashFlowTrendRemovedTest(TestCase):
    def test_the_payload_has_no_cash_flow_trend_even_with_annual_filings(self):
        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, [], [], to_annual(SAMPLE_REPORTED))

        self.assertNotIn('cash_flow_trend', result)

    def test_annual_results_is_still_built_from_the_same_reported_filings(self):
        reported = {'data': [{
            'year': 2025, 'quarter': 0, 'form': '10-K',
            'startDate': '2025-01-01 00:00:00', 'endDate': '2025-12-31 00:00:00',
            'filedDate': '2026-02-01 00:00:00',
            'report': {'ic': [{'concept': 'us-gaap_Revenues', 'value': 1000}], 'bs': [], 'cf': []},
        }]}

        result = finnhub.to_fundamentals(SAMPLE_PROFILE, SAMPLE_FINANCIALS, [], [], to_annual(reported))

        self.assertNotIn('cash_flow_trend', result)
        self.assertEqual(result['annual_results'][0]['revenue'], 1000)


class ScreenerFundamentalsTest(SimpleTestCase):
    def test_maps_every_screener_metric(self):
        financials = {'metric': {
            'peNormalizedAnnual': 24.5, 'forwardPE': 21.0, 'roeTTM': 31.2,
            'netProfitMarginTTM': 18.4, 'epsGrowth5Y': 12.0,
            'totalDebt/totalEquityAnnual': 0.8, 'dividendYieldIndicatedAnnual': 1.1,
            'marketCapitalization': 250000.0,
            'revenueGrowth5Y': 7.75, 'payoutRatioTTM': 77.24,
        }}
        self.assertEqual(finnhub.to_screener_fundamentals(financials), {
            'pe': 24.5, 'forward_pe': 21.0, 'roe': 31.2, 'net_margin': 18.4,
            'eps_growth_5y': 12.0, 'debt_to_equity': 0.8, 'dividend_yield': 1.1,
            'market_cap': 250000.0, 'revenue_growth_5y': 7.75, 'payout_ratio': 77.24,
        })

    def test_screener_fundamentals_carry_revenue_growth_and_payout(self):
        shaped = finnhub.to_screener_fundamentals({'metric': {'revenueGrowth5Y': 7.75, 'payoutRatioTTM': 77.24}})
        self.assertEqual(shaped['revenue_growth_5y'], 7.75)
        self.assertEqual(shaped['payout_ratio'], 77.24)

    def test_missing_metrics_are_null_not_zero(self):
        shaped = finnhub.to_screener_fundamentals({'metric': {'peNormalizedAnnual': 10.0}})
        self.assertEqual(shaped['pe'], 10.0)
        self.assertIsNone(shaped['roe'])
        self.assertIsNone(shaped['market_cap'])

    def test_empty_payload_is_all_null(self):
        self.assertTrue(all(v is None for v in finnhub.to_screener_fundamentals({}).values()))


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


class RecommendationHistoryGapTest(SimpleTestCase):
    def test_a_missing_row_in_the_list_is_left_out_of_the_history(self):
        shaped = finnhub.to_fundamentals(SAMPLE_PROFILE, {'metric': {}}, [
            {'period': '2026-09-01', 'strongBuy': 12, 'buy': 22, 'hold': 15, 'sell': 3, 'strongSell': 1},
            None,
            {'period': '2026-07-01', 'strongBuy': 13, 'buy': 24, 'hold': 14, 'sell': 3, 'strongSell': 0},
        ], [])

        self.assertEqual([row['period'] for row in shaped['recommendation_history']], ['2026-07-01', '2026-09-01'])


def _annual_filing(year, revenue=None, net_income=None):
    income = []
    if revenue is not None:
        income.append({'concept': 'us-gaap_Revenues', 'value': revenue})
    if net_income is not None:
        income.append({'concept': 'us-gaap_NetIncomeLoss', 'value': net_income})
    return {
        'year': year, 'quarter': 0, 'form': '10-K',
        'startDate': f'{year}-01-01 00:00:00', 'endDate': f'{year}-12-31 00:00:00',
        'filedDate': f'{year + 1}-02-01 00:00:00',
        'report': {'ic': income, 'bs': [], 'cf': []},
    }


class AnnualEpsTest(SimpleTestCase):
    def shaped(self, eps):
        return finnhub.to_fundamentals(SAMPLE_PROFILE, {'metric': {}, 'series': {'annual': {'eps': eps}}}, [], [])

    def test_carries_the_split_adjusted_series_oldest_first_rounded(self):
        shaped = self.shaped([{'period': '2025-01-26', 'v': 2.93823}, {'period': '2024-01-28', 'v': 1.19331}])

        self.assertEqual(shaped['annual_eps'], [
            {'period': '2024-01-28', 'eps': 1.19},
            {'period': '2025-01-26', 'eps': 2.94},
        ])

    def test_keeps_the_newest_eight_oldest_first(self):
        points = [{'period': f'{2010 + n}-12-31', 'v': float(n)} for n in range(12)]

        shaped = self.shaped(points)

        self.assertEqual([row['period'] for row in shaped['annual_eps']], [f'{2010 + n}-12-31' for n in range(4, 12)])

    def test_skips_points_without_a_period_or_a_number(self):
        shaped = self.shaped([{'period': '2024-12-31', 'v': None}, {'v': 3.0}, {'period': '2025-12-31', 'v': 2.0}])

        self.assertEqual(shaped['annual_eps'], [{'period': '2025-12-31', 'eps': 2.0}])

    def test_omitted_without_data(self):
        self.assertNotIn('annual_eps', self.shaped([]))
        self.assertNotIn('annual_eps', finnhub.to_fundamentals(SAMPLE_PROFILE, {'metric': {}}, [], []))


class AnnualResultsTest(SimpleTestCase):
    def shaped(self, *filings):
        return finnhub.to_fundamentals(SAMPLE_PROFILE, {'metric': {}}, [], [], to_annual({'data': list(filings)}))

    def test_summarises_revenue_and_net_income_per_fiscal_year(self):
        shaped = self.shaped(_annual_filing(2025, 1000, 200))

        self.assertEqual(shaped['annual_results'], [
            {'label': 'FY 2025', 'fiscal_year': 2025, 'revenue': 1000, 'net_income': 200},
        ])

    def test_keeps_the_newest_five_oldest_first(self):
        shaped = self.shaped(*[_annual_filing(2015 + n, 100 + n, 10) for n in range(8)])

        self.assertEqual([row['fiscal_year'] for row in shaped['annual_results']], [2018, 2019, 2020, 2021, 2022])

    def test_leaves_net_income_out_of_a_year_without_it(self):
        shaped = self.shaped(_annual_filing(2025, 1000))

        self.assertNotIn('net_income', shaped['annual_results'][0])

    def test_skips_a_year_without_revenue(self):
        shaped = self.shaped(_annual_filing(2024, None, 5), _annual_filing(2025, 1000, 200))

        self.assertEqual([row['fiscal_year'] for row in shaped['annual_results']], [2025])

    def test_omitted_without_reported_data_or_revenue(self):
        self.assertNotIn('annual_results', finnhub.to_fundamentals(SAMPLE_PROFILE, {'metric': {}}, [], []))
        self.assertNotIn('annual_results', self.shaped(_annual_filing(2025, None, 5)))
