from types import SimpleNamespace

from django.test import SimpleTestCase

from verdicts import rules


def annual(**series):
    length = max(len(values) for values in series.values())
    years = []
    for index in range(length):
        year = {'period': f'{2020 + index}-12-31'}
        for key, values in series.items():
            if index < len(values) and values[index] is not None:
                year[key] = values[index]
        years.append(year)
    return years


def stub(**overrides):
    fields = {
        'sector': 'Information Technology',
        'eps_growth_5y': 10.0,
        'revenue_growth_5y': 8.0,
        'debt_to_equity': 0.5,
        'fundamentals_history': {'annual': annual(
            roe=[20] * 5, roic=[15] * 5, net_margin=[20] * 5, eps=[1, 2, 3, 4, 5],
        )},
        'pe_history': {},
    }
    fields.update(overrides)
    return SimpleNamespace(**fields)


def statuses(result):
    return {check['key']: check['status'] for check in result['checks']}


class QualityTest(SimpleTestCase):
    def test_six_checks_in_spec_order_with_labels(self):
        result = rules.quality(stub())
        self.assertEqual(
            [(c['key'], c['label']) for c in result['checks']],
            [
                ('roe', 'Return on equity'), ('roic', 'Return on capital'), ('margins', 'Margins'),
                ('earnings_growth', 'Earnings growth'), ('revenue_growth', 'Revenue growth'),
                ('debt', 'Debt'),
            ],
        )
        self.assertEqual(result['grade'], 'strong')
        self.assertEqual({c['status'] for c in result['checks']}, {'pass'})

    def test_thresholds_are_human_strings(self):
        thresholds = {c['key']: c['threshold'] for c in rules.quality(stub())['checks']}
        self.assertEqual(thresholds, {
            'roe': '15%', 'roic': '10%', 'margins': '10%', 'earnings_growth': 'above 0',
            'revenue_growth': '5% a year', 'debt': 'at most 1.0',
        })

    def test_median_of_five_years_decides_roe_not_the_latest(self):
        row = stub(fundamentals_history={'annual': annual(roe=[20, 20, 20, 20, 5])})
        check = rules.quality(row)['checks'][0]
        self.assertEqual(check['status'], 'pass')
        self.assertEqual(check['value'], 20)

    def test_margin_fails_when_latest_is_under_half_the_median(self):
        row = stub(fundamentals_history={'annual': annual(net_margin=[20, 20, 20, 20, 9])})
        self.assertEqual(statuses(rules.quality(row))['margins'], 'fail')

    def test_margin_passes_when_latest_is_exactly_half_the_median(self):
        row = stub(fundamentals_history={'annual': annual(net_margin=[20, 20, 20, 20, 10])})
        self.assertEqual(statuses(rules.quality(row))['margins'], 'pass')

    def test_margin_fails_when_median_is_under_threshold(self):
        row = stub(fundamentals_history={'annual': annual(net_margin=[8] * 5)})
        self.assertEqual(statuses(rules.quality(row))['margins'], 'fail')

    def test_median_uses_only_years_that_have_the_figure(self):
        row = stub(fundamentals_history={'annual': annual(roe=[None, None, 10, 12, 14])})
        check = rules.quality(row)['checks'][0]
        self.assertEqual((check['status'], check['value']), ('fail', 12))

    def test_financial_sector_debt_is_unknown(self):
        for sector in ('Financials', 'Real Estate'):
            check = rules.quality(stub(sector=sector, debt_to_equity=5.0))['checks'][5]
            self.assertEqual(check['status'], 'unknown')

    def test_finnhub_industry_names_for_financials_and_real_estate_skip_debt(self):
        for sector in ('Banking', 'Insurance', 'Financial Services', 'Real Estate'):
            check = rules.quality(stub(sector=sector, debt_to_equity=5.0))['checks'][5]
            self.assertEqual(check['status'], 'unknown', sector)

    def test_empty_sector_leaves_debt_unknown(self):
        check = rules.quality(stub(sector='', debt_to_equity=5.0))['checks'][5]
        self.assertEqual((check['status'], check['value']), ('unknown', None))

    def test_negative_equity_fails_debt_keeping_its_value(self):
        check = rules.quality(stub(debt_to_equity=-2.5))['checks'][5]
        self.assertEqual(
            (check['status'], check['value'], check['threshold']), ('fail', -2.5, 'at most 1.0'),
        )

    def test_negative_equity_makes_return_on_equity_unknown(self):
        row = stub(debt_to_equity=-2.5, fundamentals_history={'annual': annual(roe=[80] * 5)})
        check = rules.quality(row)['checks'][0]
        self.assertEqual((check['status'], check['value']), ('unknown', None))

    def test_positive_equity_still_judges_return_on_equity_and_debt(self):
        result = rules.quality(stub(debt_to_equity=0.3))
        self.assertEqual(statuses(result)['roe'], 'pass')
        self.assertEqual(statuses(result)['debt'], 'pass')

    def test_missing_debt_ratio_is_unknown_and_roe_is_still_judged(self):
        result = rules.quality(stub(debt_to_equity=None))
        self.assertEqual(statuses(result)['debt'], 'unknown')
        self.assertEqual(statuses(result)['roe'], 'pass')

    def test_debt_boundary_passes(self):
        self.assertEqual(statuses(rules.quality(stub(debt_to_equity=1.0)))['debt'], 'pass')

    def test_missing_figure_is_unknown_never_pass(self):
        row = stub(
            fundamentals_history={}, eps_growth_5y=None, revenue_growth_5y=None, debt_to_equity=None,
        )
        result = rules.quality(row)
        self.assertEqual({c['status'] for c in result['checks']}, {'unknown'})
        self.assertEqual({c['value'] for c in result['checks']}, {None})
        self.assertEqual(result['grade'], 'unknown')

    def test_earnings_growth_needs_positive_latest_eps(self):
        row = stub(fundamentals_history={'annual': annual(eps=[1, 2, 3, 4, -1])})
        self.assertEqual(statuses(rules.quality(row))['earnings_growth'], 'fail')

    def test_earnings_growth_fails_on_negative_growth(self):
        self.assertEqual(statuses(rules.quality(stub(eps_growth_5y=-2.0)))['earnings_growth'], 'fail')

    def test_earnings_growth_unknown_without_latest_eps(self):
        row = stub(fundamentals_history={'annual': annual(roe=[20] * 5)})
        self.assertEqual(statuses(rules.quality(row))['earnings_growth'], 'unknown')

    def test_revenue_growth_boundary_passes(self):
        self.assertEqual(statuses(rules.quality(stub(revenue_growth_5y=5.0)))['revenue_growth'], 'pass')
        self.assertEqual(statuses(rules.quality(stub(revenue_growth_5y=4.9)))['revenue_growth'], 'fail')

    def test_grades(self):
        cases = [
            ((5, 1, 0), 'strong'), ((4, 1, 1), 'strong'), ((3, 1, 2), 'mixed'),
            ((2, 3, 1), 'weak'), ((3, 0, 3), 'unknown'), ((2, 2, 2), 'mixed'),
        ]
        for (passes, fails, unknowns), expected in cases:
            with self.subTest(passes=passes, fails=fails, unknowns=unknowns):
                checks = [{'status': 'pass'}] * passes + [{'status': 'fail'}] * fails
                checks += [{'status': 'unknown'}] * unknowns
                self.assertEqual(rules.grade(checks), expected)


class ValuationTest(SimpleTestCase):
    def test_valuation_grades_and_levels(self):
        row = stub(pe_history={'current': 18, 'p25': 20, 'p75': 30, 'eps_ttm': 5, 'weeks': 200})
        self.assertEqual(rules.valuation(row), {
            'grade': 'cheap', 'current_pe': 18, 'cheap_below': 100.0, 'expensive_above': 150.0,
        })

    def test_fair_between_the_percentiles(self):
        row = stub(pe_history={'current': 25, 'p25': 20, 'p75': 30, 'eps_ttm': 5, 'weeks': 200})
        self.assertEqual(rules.valuation(row)['grade'], 'fair')

    def test_boundaries_belong_to_cheap_and_expensive(self):
        low = stub(pe_history={'current': 20, 'p25': 20, 'p75': 30, 'eps_ttm': 5, 'weeks': 200})
        high = stub(pe_history={'current': 30, 'p25': 20, 'p75': 30, 'eps_ttm': 5, 'weeks': 200})
        self.assertEqual(rules.valuation(low)['grade'], 'cheap')
        self.assertEqual(rules.valuation(high)['grade'], 'expensive')

    def test_levels_are_rounded_to_cents(self):
        row = stub(pe_history={'current': 18, 'p25': 20.123, 'p75': 30.456, 'eps_ttm': 3.3333, 'weeks': 200})
        result = rules.valuation(row)
        self.assertEqual((result['cheap_below'], result['expensive_above']), (67.08, 101.52))

    def test_empty_pe_history_is_not_judged_with_no_levels(self):
        self.assertEqual(rules.valuation(stub(pe_history={})), {
            'grade': 'not_judged', 'current_pe': None, 'cheap_below': None, 'expensive_above': None,
        })

    def test_non_positive_earnings_are_not_judged_with_no_levels(self):
        row = stub(pe_history={'current': 18, 'p25': 20, 'p75': 30, 'eps_ttm': -1, 'weeks': 200})
        self.assertEqual(rules.valuation(row), {
            'grade': 'not_judged', 'current_pe': None, 'cheap_below': None, 'expensive_above': None,
        })

    def test_non_positive_percentile_or_current_is_not_judged(self):
        for key in ('current', 'p25', 'p75'):
            with self.subTest(key=key):
                history = {'current': 18, 'p25': 20, 'p75': 30, 'eps_ttm': 5, 'weeks': 200, key: 0}
                self.assertEqual(rules.valuation(stub(pe_history=history))['grade'], 'not_judged')


class ThresholdParityTest(SimpleTestCase):
    def test_thresholds_match_frontend_snapshot_js_T_table(self):
        self.assertEqual(rules.THRESHOLDS, {
            'roe': 15, 'roic': 10, 'net_margin': 10, 'revenue_growth': 5, 'debt_to_equity': 1.0,
        })
