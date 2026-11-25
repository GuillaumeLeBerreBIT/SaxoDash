from datetime import date
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from portfolio.account_performance import AccountDay
from portfolio.models import SAXO_SOURCE, PortfolioValuation
from users.testing import make_user, the_owner

from .models import NetWorthSnapshot

DAYS = [
    AccountDay(date(2026, 10, 9), Decimal('44000.00'), Decimal('500.00')),
    AccountDay(date(2026, 10, 12), Decimal('45000.00'), Decimal('300.00')),
]


def snapshot(day, user=None):
    return NetWorthSnapshot.objects.create(
        user=user or the_owner(), date=day, portfolio_value=Decimal('31000.00'), bank_total=Decimal('971000.00'),
        net_worth=Decimal('1002000.00'), saxo_account_value=Decimal('1001900.00'),
    )


@override_settings(REPORTING_CURRENCY='EUR')
class RestateSaxoHistoryTests(TestCase):
    def setUp(self):
        self.owner = the_owner()
        PortfolioValuation.objects.create(
            user=self.owner, source=SAXO_SOURCE, currency='EUR', total_value=Decimal('45000'), cash_balance=Decimal('300'),
            positions_value=Decimal('44700'),
        )
        days = patch('core.management.commands.restate_saxo_history.account_performance.account_days', return_value=DAYS)
        self.account_days = days.start()
        self.addCleanup(days.stop)

    def run_command(self, *args):
        out = StringIO()
        call_command('restate_saxo_history', '--user', self.owner.username, *args, stdout=out)
        return out.getvalue()

    def test_the_saxo_leg_is_rebuilt_from_the_account_history(self):
        snapshot(date(2026, 10, 12))
        self.run_command('--until', '2026-10-12', '--apply')
        row = NetWorthSnapshot.objects.get(date=date(2026, 10, 12))
        self.assertEqual(row.portfolio_value, Decimal('44700.00'))
        self.assertEqual(row.bank_total, Decimal('300.00'))
        self.assertEqual(row.net_worth, Decimal('45000.00'))
        self.assertEqual(row.saxo_account_value, Decimal('45000.00'))

    def test_a_weekend_takes_the_last_trading_day_before_it(self):
        snapshot(date(2026, 10, 11))
        self.run_command('--until', '2026-10-11', '--apply')
        self.assertEqual(NetWorthSnapshot.objects.get(date=date(2026, 10, 11)).saxo_account_value, Decimal('44000.00'))

    def test_a_snapshot_more_than_a_week_past_saxos_history_is_left_and_reported(self):
        snapshot(date(2026, 10, 19))
        snapshot(date(2026, 10, 20))
        out = self.run_command('--until', '2026-10-20', '--apply')
        self.assertEqual(NetWorthSnapshot.objects.get(date=date(2026, 10, 19)).saxo_account_value, Decimal('45000.00'))
        self.assertEqual(NetWorthSnapshot.objects.get(date=date(2026, 10, 20)).net_worth, Decimal('1002000.00'))
        self.assertIn('2026-10-20  skipped: nearest Saxo day is 2026-10-12', out)
        self.assertIn('Rebuilt 1 snapshot(s); skipped 1', out)

    def test_without_apply_nothing_is_written(self):
        snapshot(date(2026, 10, 12))
        out = self.run_command('--until', '2026-10-12')
        self.assertEqual(NetWorthSnapshot.objects.get(date=date(2026, 10, 12)).net_worth, Decimal('1002000.00'))
        self.assertIn('Dry run', out)

    def test_rows_after_until_and_before_the_history_are_untouched(self):
        snapshot(date(2026, 10, 8))
        snapshot(date(2026, 10, 13))
        self.run_command('--until', '2026-10-12', '--apply')
        self.assertEqual(NetWorthSnapshot.objects.get(date=date(2026, 10, 8)).net_worth, Decimal('1002000.00'))
        self.assertEqual(NetWorthSnapshot.objects.get(date=date(2026, 10, 13)).net_worth, Decimal('1002000.00'))

    def test_running_twice_gives_the_same_rows(self):
        snapshot(date(2026, 10, 12))
        self.run_command('--until', '2026-10-12', '--apply')
        self.run_command('--until', '2026-10-12', '--apply')
        self.assertEqual(NetWorthSnapshot.objects.get(date=date(2026, 10, 12)).net_worth, Decimal('45000.00'))

    def test_only_the_named_users_snapshots_are_rebuilt(self):
        other = make_user('other')
        snapshot(date(2026, 10, 12))
        snapshot(date(2026, 10, 12), user=other)
        self.run_command('--until', '2026-10-12', '--apply')
        self.assertEqual(NetWorthSnapshot.objects.get(user=other).net_worth, Decimal('1002000.00'))
        self.account_days.assert_called_once_with(user=self.owner)

    def test_another_users_account_currency_does_not_count(self):
        other = make_user('other')
        PortfolioValuation.objects.filter(user=self.owner).delete()
        PortfolioValuation.objects.create(
            user=other, source=SAXO_SOURCE, currency='EUR', total_value=Decimal('1'), cash_balance=Decimal('0'),
            positions_value=Decimal('1'),
        )
        with self.assertRaises(CommandError):
            self.run_command('--until', '2026-10-12', '--apply')

    def test_an_unknown_user_is_refused(self):
        with self.assertRaises(CommandError):
            call_command('restate_saxo_history', '--user', 'nobody', '--until', '2026-10-12', stdout=StringIO())

    def test_until_is_required(self):
        with self.assertRaises(CommandError):
            self.run_command('--apply')

    def test_an_account_in_another_currency_is_refused(self):
        PortfolioValuation.objects.update(currency='USD')
        snapshot(date(2026, 10, 12))
        with self.assertRaises(CommandError):
            self.run_command('--until', '2026-10-12', '--apply')
