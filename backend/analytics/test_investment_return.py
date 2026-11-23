from datetime import date, timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from saxo.client import SaxoPermanentError
from saxo.models import SaxoCredential
from users.testing import make_user, the_owner

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def weekdays(start, end):
    day = start
    while day <= end:
        if day.weekday() < 5:
            yield day
        day += timedelta(days=1)


def timeseries(points, account_values=None):
    body = {'TimeWeighted': {'Accumulated': [{'Date': f'{d.isoformat()}T00:00:00Z', 'Value': v} for d, v in points]}}
    if account_values:
        body['Balance'] = {'AccountValue': [{'Date': d.isoformat(), 'Value': v} for d, v in account_values]}
    return body


def by_label(response):
    return {row['label']: row for row in response.data['periods']}


@override_settings(CACHES=LOCMEM)
class InvestmentReturnTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = the_owner()
        self.sign_in(self.user)
        self.connect(self.user)
        self.client_key = patch('saxo.client.get_client_key', return_value='K')
        self.client_key.start()
        self.addCleanup(self.client_key.stop)

    def sign_in(self, user):
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def connect(self, user):
        SaxoCredential.objects.create(
            user=user, access_token=f'access-{user.pk}', refresh_token='refresh',
            expires_at=timezone.now() + timedelta(minutes=20),
        )

    def performance(self, body, benchmark=()):
        with patch('saxo.client.get_performance_timeseries', return_value=body), \
                patch('analytics.benchmarks.eur_closes', return_value=list(benchmark)):
            return self.client.get('/api/analytics/performance/')

    def test_a_deposit_into_a_flat_account_is_an_investment_return_of_zero(self):
        days = list(weekdays(date(2026, 3, 2), date(2026, 3, 13)))
        values = [(d, 1000.0 if d < date(2026, 3, 9) else 6000.0) for d in days]
        response = self.performance(timeseries([(d, 0.0) for d in days], values))
        self.assertEqual(by_label(response)['Since inception']['portfolio_pct'], 0.0)
        self.assertIsNone(response.data['history_warning'])

    def test_the_first_partial_year_is_measured_against_the_benchmark_over_the_same_window(self):
        days = list(weekdays(date(2025, 7, 1), date(2026, 2, 27)))
        growth = [(d, 0.0 if d.year == 2025 and d < date(2025, 12, 31) else (0.1 if d.year == 2025 else 0.21)) for d in days]
        benchmark = [(d, 200.0 if d < date(2025, 7, 1) else (100.0 if d < date(2025, 12, 31) else 105.0))
                     for d in weekdays(date(2024, 1, 1), date(2026, 2, 27))]
        response = self.performance(timeseries(growth), benchmark)
        rows = {row['year']: row for row in response.data['calendar_years']}
        self.assertEqual(sorted(rows), [2025, 2026])
        self.assertAlmostEqual(rows[2025]['portfolio_pct'], 10.0)
        self.assertAlmostEqual(rows[2025]['benchmark_pct'], 5.0)
        self.assertTrue(rows[2025]['partial'])
        self.assertAlmostEqual(rows[2026]['portfolio_pct'], 10.0)

    def test_the_last_good_history_is_served_with_a_dated_warning_when_saxo_cannot_answer(self):
        days = list(weekdays(date(2026, 10, 19), date(2026, 10, 28)))
        self.performance(timeseries([(d, 0.0) for d in days[:-1]] + [(days[-1], 0.05)]))
        cache.delete(f'portfolio:account-performance:v1:{self.user.pk}')
        with patch('saxo.client.get_performance_timeseries', side_effect=SaxoPermanentError('500')), \
                patch('analytics.benchmarks.eur_closes', return_value=[]):
            response = self.client.get('/api/analytics/performance/')
        self.assertAlmostEqual(by_label(response)['Since inception']['portfolio_pct'], 5.0)
        self.assertEqual(
            response.data['history_warning'],
            'Saxo did not answer the account history request. Showing your history up to 28 Oct 2026.',
        )

    def test_weekend_points_are_left_out_of_the_trading_day_series(self):
        friday = date(2026, 9, 18)
        points = [(friday + timedelta(days=offset), 0.0) for offset in range(4)]
        with patch('saxo.client.get_performance_timeseries', return_value=timeseries(points)), \
                patch('analytics.benchmarks.eur_closes', return_value=[]):
            response = self.client.get('/api/analytics/risk/')
        self.assertEqual([row['date'] for row in response.data['drawdown_series']], ['2026-09-18', '2026-09-21'])

    def test_one_users_investment_return_is_never_served_to_another(self):
        days = list(weekdays(date(2026, 3, 2), date(2026, 3, 13)))
        self.performance(timeseries([(d, 0.0) for d in days[:-1]] + [(days[-1], 0.2)]))
        other = make_user('other')
        self.connect(other)
        self.sign_in(other)
        response = self.performance(timeseries([(d, 0.0) for d in days]))
        self.assertEqual(by_label(response)['Since inception']['portfolio_pct'], 0.0)
