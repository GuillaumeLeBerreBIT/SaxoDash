from datetime import date, timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings

from research import finnhub
from research.valuation import (
    NO_DAILY_PE_WARNING, PE_WINDOW_BARS, current_pe, history, latest_quarter, median_since, pe_percentiles,
    published_eps, stored_eps, trailing_pe, usual_range_at,
)

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def quarters(*values):
    return [(date(2024, 3 * (i + 1), 28), v) for i, v in enumerate(values)]


class TrailingPeTest(SimpleTestCase):
    def test_ttm_needs_four_quarters(self):
        closes = [(date(2024, 10, 1), 100.0)]
        self.assertEqual(trailing_pe(closes, quarters(1, 1, 1)), [(date(2024, 10, 1), None)])

    def test_negative_ttm_is_null(self):
        closes = [(date(2025, 1, 5), 100.0)]
        self.assertEqual(trailing_pe(closes, quarters(-1, 0.2, 0.2, 0.2)), [(date(2025, 1, 5), None)])

    def test_a_quarter_does_not_count_on_the_day_after_its_period_end(self):
        eps = published_eps([(date(2024, 3, 31), 1.0), (date(2024, 6, 30), 1.0), (date(2024, 9, 30), 1.0),
                             (date(2024, 12, 31), 1.0), (date(2025, 3, 31), 2.0)])
        self.assertEqual(trailing_pe([(date(2025, 4, 1), 40.0)], eps), [(date(2025, 4, 1), 10.0)])

    def test_close_before_any_quarter_is_null(self):
        self.assertEqual(trailing_pe([(date(2020, 1, 1), 5.0)], quarters(1, 1, 1, 1)), [(date(2020, 1, 1), None)])


FOUR_QUARTERS = [(date(2024, 3, 31), 1.0), (date(2024, 6, 30), 1.0), (date(2024, 9, 30), 1.0), (date(2024, 12, 31), 1.0)]
NEW_QUARTER = (date(2025, 3, 31), 2.0)


class PublicationDatingTest(SimpleTestCase):
    def pe_on(self, day, eps):
        return trailing_pe([(day, 50.0)], eps)[0][1]

    def test_the_day_before_a_release_uses_the_previous_four_quarters(self):
        eps = published_eps([*FOUR_QUARTERS, NEW_QUARTER], released={NEW_QUARTER[0]: date(2025, 4, 24)})
        self.assertEqual(self.pe_on(date(2025, 4, 23), eps), 12.5)

    def test_on_the_release_day_it_uses_the_new_quarter(self):
        eps = published_eps([*FOUR_QUARTERS, NEW_QUARTER], released={NEW_QUARTER[0]: date(2025, 4, 24)})
        self.assertEqual(self.pe_on(date(2025, 4, 24), eps), 10.0)

    def test_an_unknown_release_counts_forty_five_days_after_the_quarter(self):
        eps = published_eps([*FOUR_QUARTERS, NEW_QUARTER])
        self.assertEqual(self.pe_on(date(2025, 5, 14), eps), 12.5)
        self.assertEqual(self.pe_on(date(2025, 5, 15), eps), 10.0)

    def test_an_unknown_fiscal_year_release_counts_sixty_days_after_the_year_end(self):
        year_end = (date(2025, 6, 30), 2.0)
        eps = published_eps([*FOUR_QUARTERS, NEW_QUARTER, year_end], year_ends=[date(2023, 6, 30)])
        self.assertEqual(self.pe_on(date(2025, 8, 28), eps), 10.0)
        self.assertEqual(self.pe_on(date(2025, 8, 29), eps), round(50 / 6, 2))

    def test_a_fifty_two_week_year_end_still_reads_as_the_year_end(self):
        year_end = (date(2025, 9, 27), 2.0)
        eps = published_eps([*FOUR_QUARTERS, NEW_QUARTER, year_end], year_ends=[date(2022, 9, 24)])
        self.assertEqual(self.pe_on(date(2025, 11, 25), eps), 10.0)

    def test_a_release_on_or_before_the_period_end_never_counts_before_the_period_ends(self):
        eps = published_eps([*FOUR_QUARTERS, NEW_QUARTER], released={NEW_QUARTER[0]: date(2025, 3, 20)})
        self.assertEqual(self.pe_on(date(2025, 3, 31), eps), 12.5)
        self.assertEqual(self.pe_on(date(2025, 4, 1), eps), 10.0)

    def test_stored_history_carries_its_release_dates_and_year_ends(self):
        stored = {
            'annual': [{'period': '2023-12-31', 'roe': 10.0}],
            'quarterly_eps': [['2025-03-31', 99.0]] + [[day.isoformat(), value] for day, value in [*FOUR_QUARTERS, NEW_QUARTER]]
                + [['bad', 1.0], ['2025-06-30', 'nan'], ['2024-09-30', None], ['2025-03-31', 2.0]],
            'eps_released': {'2025-03-31': '2025-04-24'},
        }
        eps = stored_eps(stored)
        self.assertEqual(eps[-1], (date(2025, 4, 24), 2.0))
        self.assertEqual(eps[-2], (date(2025, 3, 1), 1.0))
        self.assertEqual(len(eps), 5)

    def test_the_latest_quarter_is_the_newest_one_already_public(self):
        stored = {
            'quarterly_eps': [['2025-03-31', 2.0], ['2025-06-30', 2.5]],
            'eps_released': {'2025-03-31': '2025-04-24', '2025-06-30': '2025-07-30'},
        }
        self.assertEqual(latest_quarter(stored, today=date(2025, 7, 29)), (date(2025, 3, 31), date(2025, 4, 24)))
        self.assertEqual(latest_quarter(stored, today=date(2025, 7, 30)), (date(2025, 6, 30), date(2025, 7, 30)))

    def test_a_latest_quarter_without_a_release_date_counts_from_the_fallback(self):
        stored = {'quarterly_eps': [['2025-03-31', 2.0]]}
        self.assertEqual(latest_quarter(stored, today=date(2025, 5, 14)), (None, None))
        self.assertEqual(latest_quarter(stored, today=date(2025, 5, 15)), (date(2025, 3, 31), None))


class MedianTest(SimpleTestCase):
    def test_median_since_five_years(self):
        points = [(date(2018, 1, 1), 1000.0), (date(2021, 6, 1), 10.0), (date(2022, 6, 1), 20.0), (date(2024, 6, 1), 30.0)]
        self.assertEqual(median_since(points, years=5, today=date(2025, 1, 1)), 20.0)

    def test_median_ignores_nulls_and_empty_is_none(self):
        self.assertIsNone(median_since([(date(2024, 1, 1), None)], today=date(2025, 1, 1)))
        self.assertIsNone(median_since([], today=date(2025, 1, 1)))


@override_settings(CACHES=LOCMEM)
class ValuationSeriesTest(TestCase):
    def setUp(self):
        cache.clear()

    def test_series_shaping_omits_missing_and_orders_oldest_first(self):
        payload = {'series': {
            'annual': {'pe': [{'period': '2024-12-31', 'v': 30}, {'period': '2023-12-31', 'v': 25}]},
            'quarterly': {'peTTM': [{'period': '2025-03-31', 'v': 40}, {'period': '2024-12-31', 'v': 35}],
                          'eps': [{'period': '2025-03-31', 'v': 1.0}]},
        }}
        with patch('research.finnhub._get', return_value=payload) as get:
            result = finnhub.valuation_series('NVDA')
            finnhub.valuation_series('NVDA')
        self.assertEqual([call.args[0] for call in get.call_args_list].count('/stock/metric'), 1)
        self.assertEqual(result['annual'], {'pe': [{'period': '2023-12-31', 'v': 25}, {'period': '2024-12-31', 'v': 30}]})
        self.assertEqual(result['quarterly']['pe_ttm'][0], {'period': '2024-12-31', 'v': 35})
        self.assertEqual(set(result['quarterly']), {'pe_ttm', 'eps'})

    def test_non_positive_multiples_are_null_not_negative(self):
        payload = {'series': {
            'annual': {'pe': [{'period': '2023-12-31', 'v': -12}, {'period': '2024-12-31', 'v': 25}]},
            'quarterly': {
                'peTTM': [{'period': '2024-12-31', 'v': 35}, {'period': '2025-03-31', 'v': -40}],
                'pfcfTTM': [{'period': '2025-03-31', 'v': 0}],
                'evEbitdaTTM': [{'period': '2025-03-31', 'v': -3}],
                'psTTM': [{'period': '2025-03-31', 'v': 4}],
                'eps': [{'period': '2025-03-31', 'v': -1.0}],
            },
        }}
        with patch('research.finnhub._get', return_value=payload):
            result = finnhub.valuation_series('LOSS')
        quarterly = result['quarterly']
        self.assertEqual(quarterly['pe_ttm'], [{'period': '2024-12-31', 'v': 35}, {'period': '2025-03-31', 'v': None}])
        self.assertEqual(quarterly['pfcf_ttm'], [{'period': '2025-03-31', 'v': None}])
        self.assertEqual(quarterly['ev_ebitda_ttm'], [{'period': '2025-03-31', 'v': None}])
        self.assertEqual(quarterly['ps_ttm'], [{'period': '2025-03-31', 'v': 4}])
        self.assertEqual(quarterly['eps'], [{'period': '2025-03-31', 'v': -1.0}])
        self.assertEqual(result['annual']['pe'][0], {'period': '2023-12-31', 'v': None})

    def test_series_carries_the_profile_country(self):
        def get(path, **params):
            return {'name': 'Taiwan Semi', 'country': 'TW'} if path == '/stock/profile2' else {'series': {}}

        with patch('research.finnhub._get', side_effect=get):
            self.assertEqual(finnhub.valuation_series('TSM')['country'], 'TW')

    def test_series_shares_the_metric_call_with_fundamentals(self):
        def get(path, **params):
            if path == '/stock/profile2':
                return {'name': 'NVIDIA', 'country': 'US'}
            if path == '/stock/metric':
                return {'metric': {}, 'series': {'quarterly': {'peTTM': [{'period': '2025-03-31', 'v': 40}]}}}
            if path == '/stock/financials-reported':
                return {'data': []}
            return []

        with patch('research.finnhub._get', side_effect=get) as calls:
            finnhub.fundamentals('NVDA')
            finnhub.valuation_series('NVDA')
        paths = [call.args[0] for call in calls.call_args_list]
        self.assertEqual(paths.count('/stock/metric'), 1)
        self.assertEqual(paths.count('/stock/profile2'), 1)

    def test_an_unreadable_metric_payload_is_unavailable(self):
        with patch('research.finnhub._get', return_value=['not', 'a', 'dict']):
            with self.assertRaises(finnhub.FinnhubUnexpected):
                finnhub.valuation_series('NVDA')

    def test_a_busy_profile_only_loses_the_country(self):
        def get(path, **params):
            if path == '/stock/profile2':
                raise finnhub.FinnhubBusy()
            return {'series': {'quarterly': {'peTTM': [{'period': '2025-03-31', 'v': 40}]}}}

        with patch('research.finnhub._get', side_effect=get):
            result = finnhub.valuation_series('NVDA')
        self.assertIsNone(result['country'])
        self.assertEqual(result['quarterly']['pe_ttm'], [{'period': '2025-03-31', 'v': 40}])


SERIES = {
    'annual': {'pe': [{'period': '2023-12-31', 'v': 25}]},
    'quarterly': {
        'pe_ttm': [{'period': '2024-06-30', 'v': 30}, {'period': '2024-09-30', 'v': 40}],
        'eps': [{'period': '2024-03-31', 'v': 1.0}, {'period': '2024-06-30', 'v': 1.0},
                {'period': '2024-09-30', 'v': 1.0}, {'period': '2024-12-31', 'v': 1.0}],
    },
    'country': 'US',
}
BARS = [{'date': d, 'close': 40.0} for d in ('2025-03-10', '2025-03-11', '2025-03-14', '2025-03-17')]
JANUARY_BARS = [{'date': d, 'close': 40.0} for d in ('2025-01-06', '2025-01-07', '2025-01-10', '2025-01-13')]


class HistoryTest(SimpleTestCase):
    def test_daily_pe_is_sampled_weekly_with_medians_and_latest(self):
        data, warnings = history('NVDA', SERIES, BARS, today=date(2025, 6, 1))
        self.assertEqual(data['daily_pe'], [['2025-03-14', 10.0], ['2025-03-17', 10.0]])
        self.assertEqual(data['latest'], {'pe_ttm': 40, 'ps_ttm': None, 'pfcf_ttm': None, 'ev_ebitda_ttm': None, 'daily_pe': 10.0})
        self.assertEqual(data['medians_5y']['pe_ttm'], 35)
        self.assertEqual(warnings, [])

    def test_a_fiscal_year_quarter_counts_sixty_days_after_its_end(self):
        data, _ = history('NVDA', SERIES, JANUARY_BARS, today=date(2025, 6, 1))
        self.assertEqual(data['daily_pe'], [['2025-01-10', None], ['2025-01-13', None]])

    def test_a_known_release_date_counts_from_that_day(self):
        data, _ = history('NVDA', SERIES, JANUARY_BARS, today=date(2025, 6, 1),
                          released={date(2024, 12, 31): date(2025, 1, 8)})
        self.assertEqual(data['daily_pe'], [['2025-01-10', 10.0], ['2025-01-13', 10.0]])

    def test_no_bars_means_no_daily_pe_with_a_reason(self):
        data, warnings = history('NVDA', SERIES, None)
        self.assertEqual(data['daily_pe'], [])
        self.assertIsNone(data['latest']['daily_pe'])
        self.assertEqual(warnings, [NO_DAILY_PE_WARNING])

    def test_a_foreign_issuer_is_warned(self):
        _, warnings = history('TSM', {**SERIES, 'country': 'TW'}, BARS)
        self.assertIn('TW company', warnings[0])


def weekdays(start, end, close_at):
    bars = []
    day = start
    while day <= end:
        if day.weekday() < 5:
            bars.append({'date': day.isoformat(), 'close': close_at(day)})
        day += timedelta(days=1)
    return bars


LONG_SERIES = {
    **SERIES,
    'quarterly': {
        **SERIES['quarterly'],
        'eps': [{'period': f'{year}-{end}', 'v': 1.0} for year in range(2020, 2027) for end in ('03-31', '06-30', '09-30', '12-31') if f'{year}-{end}' <= '2026-06-30'],
    },
}


class DailyBandTest(SimpleTestCase):
    def test_the_band_is_empty_until_two_years_of_weekly_pe_exist(self):
        data, _ = history('NVDA', LONG_SERIES, weekdays(date(2024, 6, 3), date(2025, 6, 30), lambda d: 40.0), band=True)
        self.assertTrue(all(low is None and high is None for _, low, high in data['daily_pe_band']))

    def test_a_band_on_a_day_does_not_change_when_later_bars_arrive(self):
        start = date(2024, 6, 3)
        bars = weekdays(start, date(2026, 6, 30), lambda d: 40.0 + (d - start).days / 30)
        full, _ = history('NVDA', LONG_SERIES, bars, band=True)
        cut, _ = history('NVDA', LONG_SERIES, bars[:-120], band=True)
        self.assertEqual(cut['daily_pe_band'], full['daily_pe_band'][:len(cut['daily_pe_band'])])

    def test_a_price_above_its_history_widens_the_band(self):
        bars = weekdays(date(2020, 6, 1), date(2026, 6, 30), lambda d: 40.0 if d < date(2023, 6, 1) else 400.0)
        data, _ = history('NVDA', LONG_SERIES, bars, band=True)
        before_jump = [row for row in data['daily_pe_band'] if row[0] == '2023-05-26'][0]
        last = data['daily_pe_band'][-1]
        self.assertEqual(before_jump[1:], [10.0, 10.0])
        self.assertGreater(last[2], 10.0)

    def test_the_latest_band_matches_the_percentiles_shown_elsewhere(self):
        bars = weekdays(date(2020, 6, 1), date(2026, 6, 30), lambda d: 40.0 + (d - date(2020, 6, 1)).days / 100)
        data, _ = history('NVDA', LONG_SERIES, bars, band=True)
        closes = [(date.fromisoformat(b['date']), b['close']) for b in bars]
        quarterly = [(date.fromisoformat(p['period']), p['v']) for p in LONG_SERIES['quarterly']['eps']]
        percentiles = pe_percentiles(closes, published_eps(quarterly, None, [date(2023, 12, 31)]))
        self.assertEqual(data['daily_pe_band'][-1][1:], [percentiles['p25'], percentiles['p75']])


class UsualRangeTest(SimpleTestCase):
    def test_only_the_last_window_of_bars_counts(self):
        start = date(2000, 1, 3)
        daily = [(start + timedelta(days=i), 1000.0 if i < 300 else 10.0) for i in range(PE_WINDOW_BARS + 300)]
        self.assertEqual(usual_range_at(daily, len(daily) - 1), (10.0, 10.0))

    def test_a_week_counts_at_its_latest_day_with_a_pe(self):
        start = date(2020, 1, 6)
        daily = [(start + timedelta(days=i), None if (start + timedelta(days=i)).weekday() == 6 else 10.0)
                 for i in range(730)]
        self.assertEqual(usual_range_at(daily, len(daily) - 1), (10.0, 10.0))


class CurrentPeTest(SimpleTestCase):
    def test_the_series_value_wins(self):
        self.assertEqual(current_pe(30.0, {'pe_ratio': 99.0, 'eps_ttm': 2.0}), 30.0)

    def test_a_loss_maker_has_no_pe_even_from_the_series(self):
        self.assertIsNone(current_pe(30.0, {'eps_ttm': -2.0}))

    def test_falls_back_to_the_metric_unless_a_loss(self):
        self.assertEqual(current_pe(None, {'pe_ratio': 20.0, 'eps_ttm': 2.0}), 20.0)
        self.assertIsNone(current_pe(None, {'pe_ratio': 20.0, 'eps_ttm': -1.0}))
        self.assertIsNone(current_pe(None, {'pe_ratio': -5.0}))
        self.assertIsNone(current_pe(None, None))


def daily_closes(start, days):
    return [(start + timedelta(days=i), 40.0 + i * 0.05) for i in range(days)]


def quarterly_eps(value, count=16, start=date(2021, 3, 31)):
    return [(start + timedelta(days=91 * i), value) for i in range(count)]


class PePercentilesTest(SimpleTestCase):
    def test_over_weekly_positive_points(self):
        closes = daily_closes(date(2023, 1, 2), 3 * 365)
        out = pe_percentiles(closes, quarterly_eps(1.0))
        self.assertEqual(out['eps_ttm'], 4.0)
        self.assertLess(out['p25'], out['p75'])
        self.assertEqual(out['current'], round(closes[-1][1] / 4.0, 2))
        self.assertGreaterEqual(out['weeks'], 104)

    def test_none_under_104_weeks(self):
        closes = daily_closes(date(2023, 1, 2), 80 * 7)
        self.assertIsNone(pe_percentiles(closes, quarterly_eps(1.0)))

    def test_none_when_latest_trailing_eps_is_not_positive(self):
        closes = daily_closes(date(2023, 1, 2), 3 * 365)
        eps = quarterly_eps(1.0)
        eps[-4:] = [(day, -1.0) for day, _ in eps[-4:]]
        self.assertIsNone(pe_percentiles(closes, eps))

    def test_bars_without_a_close_are_dropped(self):
        closes = daily_closes(date(2023, 1, 2), 3 * 365) + [(date(2026, 1, 5), None)]
        self.assertEqual(pe_percentiles(closes, quarterly_eps(1.0))['current'], round(closes[-2][1] / 4.0, 2))
