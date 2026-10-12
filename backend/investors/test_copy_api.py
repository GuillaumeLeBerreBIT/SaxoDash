from datetime import date
from io import StringIO
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase

from core.scheduling import PERIODIC_TASKS
from research.providers import ProviderNotConnected
from saxo.models import SyncRun

from . import tasks
from .factories import make_investor
from .models import CopyPerformance


def measured(investor, **over):
    fields = {
        'since': date(2023, 2, 15), 'until': date(2026, 10, 9), 'clone_return_pct': 80.0,
        'benchmark_return_pct': 50.0, 'clone_cagr_pct': 17.5, 'benchmark_cagr_pct': 11.75, 'coverage_pct': 91.2,
        'periods': 14, 'skipped_periods': 1, 'series': [['2023-02-15', 100.0, 100.0], ['2026-10-09', 180.0, 150.0]],
    }
    return CopyPerformance.objects.create(investor=investor, **{**fields, **over})


class CopyApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        self.investor = make_investor()

    def url(self, slug='berkshire-hathaway'):
        return reverse('investor-copy', args=[slug])

    def test_needs_a_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.url()).status_code, 401)

    def test_an_unknown_investor_is_404(self):
        self.assertEqual(self.client.get(self.url('nobody')).status_code, 404)

    def test_an_investor_not_measured_yet_says_so_and_still_states_the_method(self):
        response = self.client.get(self.url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'available': False, 'benchmark': 'S&P 500', 'holdings': 20})

    def test_a_measured_investor_answers_with_returns_and_the_series(self):
        measured(self.investor)

        data = self.client.get(self.url()).data

        self.assertEqual(
            {key: data[key] for key in data if key != 'computed_at'},
            {
                'available': True, 'benchmark': 'S&P 500', 'holdings': 20,
                'since': '2023-02-15', 'until': '2026-10-09',
                'clone_return_pct': 80.0, 'benchmark_return_pct': 50.0, 'excess_return_pct': 30.0,
                'clone_cagr_pct': 17.5, 'benchmark_cagr_pct': 11.75, 'excess_cagr_pct': 5.75,
                'coverage_pct': 91.2, 'periods': 14, 'skipped_periods': 1,
                'series': [['2023-02-15', 100.0, 100.0], ['2026-10-09', 180.0, 150.0]],
            },
        )

    def test_a_short_history_has_no_annualised_figures(self):
        measured(self.investor, clone_cagr_pct=None, benchmark_cagr_pct=None)

        data = self.client.get(self.url()).data

        self.assertEqual((data['clone_cagr_pct'], data['excess_cagr_pct']), (None, None))

    def test_directory_cards_carry_the_annualised_edge_for_sorting(self):
        measured(self.investor)
        make_investor(cik=2, slug='other', firm='Other')

        cards = {card['slug']: card for card in self.client.get(reverse('investor-list')).data}

        self.assertEqual(cards['berkshire-hathaway']['copy_excess_cagr_pct'], 5.75)
        self.assertIsNone(cards['other']['copy_excess_cagr_pct'])


@patch('saxo.tasks.active_credential', return_value=object())
@patch('investors.tasks.copying.rebuild_all', return_value=88)
@patch('investors.tasks.price_feed.refresh', return_value=700)
class RefreshTaskTest(TestCase):
    def run_recorded(self):
        tasks.refresh_copy_performance()
        return SyncRun.objects.filter(task=tasks.COPY_TASK).first()

    def test_fetches_prices_then_measures_every_investor(self, refresh, rebuild_all, _credential):
        run = self.run_recorded()

        self.assertEqual((run.outcome, run.rows, run.detail), ('ok', 88, '700 price series fetched'))

    def test_prices_already_fetched_are_measured_even_when_saxo_drops_out(self, refresh, rebuild_all, _credential):
        refresh.side_effect = ProviderNotConnected('expired')

        with self.assertRaises(ProviderNotConnected):
            tasks.refresh_copy_performance()

        self.assertEqual(SyncRun.objects.filter(task=tasks.COPY_TASK).first().outcome, 'failed')
        rebuild_all.assert_called_once_with()

    def test_it_never_touches_the_saxo_health_badge(self, refresh, rebuild_all, _credential):
        from saxo.credentials import SYNC_TASKS

        self.assertNotIn(tasks.COPY_TASK, SYNC_TASKS)

    def test_it_runs_nightly(self, refresh, rebuild_all, _credential):
        scheduled = [entry for entry in PERIODIC_TASKS.values() if entry['task'] == 'investors.tasks.refresh_copy_performance']

        self.assertEqual(len(scheduled), 1)
        self.assertEqual(set(scheduled[0]['crontab']), {'minute', 'hour'})


class RebuildCommandTest(TestCase):
    @patch('investors.management.commands.rebuild_copy_performance.copying.rebuild_all', return_value=3)
    def test_the_command_measures_from_stored_prices_without_calling_saxo(self, rebuild_all):
        out = StringIO()

        call_command('rebuild_copy_performance', stdout=out)

        self.assertIn('3 investors measured', out.getvalue())
