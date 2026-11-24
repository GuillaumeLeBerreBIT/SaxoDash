from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from saxo.client import SaxoPermanentError
from saxo.credentials import SaxoNotConnected

from . import account_performance

OWNER = SimpleNamespace(pk=1)
OTHER = SimpleNamespace(pk=2)
LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
BODY = {
    'Balance': {'AccountValue': [{'Date': '2026-10-27', 'Value': 45000.0}]},
    'TimeWeighted': {'Accumulated': [
        {'Date': '2026-10-27', 'Value': 0.0},
        {'Date': '2026-10-28', 'Value': 0.1},
        {'Date': '2026-10-29', 'Value': -0.05},
    ]},
}


def connected():
    return patch('portfolio.account_performance.active_credential', return_value=SimpleNamespace(access_token='t'))


def not_connected():
    return patch('portfolio.account_performance.active_credential', side_effect=SaxoNotConnected('Token expired.'))


@override_settings(CACHES=LOCMEM)
class GrowthSeriesTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def read(self, body=BODY):
        with connected(), \
                patch('saxo.client.get_client_key', return_value='K'), \
                patch('saxo.client.get_performance_timeseries', return_value=body) as fetch:
            return account_performance.growth_series(user=OWNER), fetch

    def test_the_time_weighted_return_becomes_the_growth_of_one_euro(self):
        (growth, warning), fetch = self.read()
        fetch.assert_called_once_with('t', 'K')
        self.assertIsNone(warning)
        self.assertEqual(growth, [(date(2026, 10, 27), 1.0), (date(2026, 10, 28), 1.1), (date(2026, 10, 29), 0.95)])

    def test_a_second_ask_is_answered_from_the_cache(self):
        self.read()
        (growth, _), fetch = self.read({'TimeWeighted': {'Accumulated': []}})
        fetch.assert_not_called()
        self.assertEqual(len(growth), 3)

    def test_one_users_history_is_never_served_to_another(self):
        self.read()
        with connected(), \
                patch('saxo.client.get_client_key', return_value='K2'), \
                patch('saxo.client.get_performance_timeseries', return_value={'TimeWeighted': {'Accumulated': []}}) as fetch:
            growth, _ = account_performance.growth_series(user=OTHER)
        fetch.assert_called_once_with('t', 'K2')
        self.assertEqual(growth, [])

    def test_another_users_outage_does_not_fall_back_to_someone_elses_history(self):
        self.read()
        with not_connected():
            growth, warning = account_performance.growth_series(user=OTHER)
        self.assertEqual(growth, [])
        self.assertEqual(warning, 'Saxo is not connected: Token expired.')

    def test_not_connected_without_history_is_an_empty_series_with_a_reason(self):
        with not_connected():
            growth, warning = account_performance.growth_series(user=OWNER)
        self.assertEqual(growth, [])
        self.assertEqual(warning, 'Saxo is not connected: Token expired.')

    def test_not_connected_after_a_good_read_serves_the_last_history_and_says_so(self):
        self.read()
        cache.delete(account_performance._cache_key(OWNER))
        with not_connected():
            growth, warning = account_performance.growth_series(user=OWNER)
        self.assertEqual(len(growth), 3)
        self.assertEqual(warning, 'Saxo is not connected: Token expired. Showing your history up to 29 Oct 2026.')

    def test_a_refused_request_is_a_reason_not_a_crash(self):
        with connected(), \
                patch('saxo.client.get_client_key', return_value='K'), \
                patch('saxo.client.get_performance_timeseries', side_effect=SaxoPermanentError('400')):
            growth, warning = account_performance.growth_series(user=OWNER)
        self.assertEqual(growth, [])
        self.assertEqual(warning, 'Saxo did not answer the account history request.')

    def test_a_malformed_reply_serves_the_last_history_and_says_so(self):
        for point in ({'Date': 'yesterday', 'Value': 0.1}, {'Date': '2026-10-30'}, {'Date': '2026-10-30', 'Value': None}):
            with self.subTest(point=point):
                cache.clear()
                self.read()
                cache.delete(account_performance._cache_key(OWNER))
                (growth, warning), _ = self.read({'TimeWeighted': {'Accumulated': [point]}})
                self.assertEqual(len(growth), 3)
                self.assertEqual(warning, "Saxo's account history reply could not be read. Showing your history up to 29 Oct 2026.")

    def test_a_malformed_reply_is_not_cached_as_good_history(self):
        self.read({'TimeWeighted': {'Accumulated': [{'Date': '2026-10-30'}]}})
        (growth, warning), _ = self.read()
        self.assertEqual(len(growth), 3)
        self.assertIsNone(warning)

    def test_an_empty_reply_after_a_good_read_does_not_erase_the_history(self):
        self.read()
        cache.delete(account_performance._cache_key(OWNER))
        self.read({'TimeWeighted': {'Accumulated': []}})
        cache.delete(account_performance._cache_key(OWNER))
        with connected(), \
                patch('saxo.client.get_client_key', return_value='K'), \
                patch('saxo.client.get_performance_timeseries', side_effect=SaxoPermanentError('500')):
            growth, warning = account_performance.growth_series(user=OWNER)
        self.assertEqual(len(growth), 3)
        self.assertEqual(warning, 'Saxo did not answer the account history request. Showing your history up to 29 Oct 2026.')

    def test_a_reply_without_a_time_weighted_series_is_an_empty_history(self):
        (growth, warning), _ = self.read({'Balance': {}})
        self.assertEqual(growth, [])
        self.assertIsNone(warning)


@override_settings(CACHES=LOCMEM)
class AccountDaysTests(SimpleTestCase):
    def test_each_day_carries_the_account_value_and_its_cash(self):
        body = {'Balance': {
            'AccountValue': [{'Date': '2026-10-27', 'Value': 45000.12}, {'Date': '2026-10-28', 'Value': 45010.96}],
            'CashBalance': [{'Date': '2026-10-27', 'Value': 30.5}, {'Date': '2026-10-28', 'Value': 38.79}],
        }}
        with connected(), \
                patch('saxo.client.get_client_key', return_value='K'), \
                patch('saxo.client.get_performance_timeseries', return_value=body):
            days = account_performance.account_days(user=OWNER)
        self.assertEqual(days, [
            account_performance.AccountDay(date(2026, 10, 27), Decimal('45000.12'), Decimal('30.5')),
            account_performance.AccountDay(date(2026, 10, 28), Decimal('45010.96'), Decimal('38.79')),
        ])

    def test_a_day_without_its_cash_is_left_out(self):
        body = {'Balance': {'AccountValue': [{'Date': '2026-10-27', 'Value': 1.0}], 'CashBalance': []}}
        with connected(), \
                patch('saxo.client.get_client_key', return_value='K'), \
                patch('saxo.client.get_performance_timeseries', return_value=body):
            self.assertEqual(account_performance.account_days(user=OWNER), [])
