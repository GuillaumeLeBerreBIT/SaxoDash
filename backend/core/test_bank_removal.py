from datetime import date
from decimal import Decimal

from django.apps import apps as installed_apps
from django.conf import settings
from django.core.checks import registry
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import SimpleTestCase, TransactionTestCase

from core.restatement import without_bank_money

CORE_BEFORE = ('core', '0014_drop_bank_sync_schedule')
CORE_RESTATED = ('core', '0015_restate_without_bank_money')
CORE_DROPPED = ('core', '0016_remove_networthsnapshot_bank_only_total')


class WithoutBankMoneyTest(SimpleTestCase):
    def test_a_recorded_bank_only_total_is_taken_out_of_bank_and_net_worth(self):
        self.assertEqual(
            without_bank_money(Decimal('30000.00'), Decimal('3500.00'), Decimal('2500.00')),
            (Decimal('1000.00'), Decimal('31000.00')),
        )

    def test_an_unrecorded_bank_only_total_counts_as_zero(self):
        self.assertEqual(
            without_bank_money(Decimal('30000.00'), Decimal('1000.00'), None),
            (Decimal('1000.00'), Decimal('31000.00')),
        )


class NoBankConfigTest(SimpleTestCase):
    def test_no_enable_banking_setting_or_system_check_remains(self):
        self.assertEqual([name for name in dir(settings) if name.startswith('ENABLE_BANKING')], [])
        self.assertEqual(
            [check for check in registry.registry.get_checks() if check.__module__.startswith('enablebanking')],
            [],
        )

    def test_enablebanking_is_not_an_installed_app(self):
        self.assertFalse(installed_apps.is_installed('enablebanking'))


class MigrationTestCase(TransactionTestCase):
    def migrate(self, *targets):
        executor = MigrationExecutor(connection)
        executor.migrate(list(targets))
        return executor.loader.project_state(list(targets)).apps

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()


class RestateHistoryMigrationTest(MigrationTestCase):
    def test_every_snapshot_loses_its_bank_money_and_keeps_the_saxo_series(self):
        apps = self.migrate(CORE_BEFORE)
        user = apps.get_model('auth', 'User').objects.create(username='demo', password='!')
        snapshot = apps.get_model('core', 'NetWorthSnapshot')
        snapshot.objects.create(
            user=user, date=date(2026, 9, 1), portfolio_value=Decimal('30000.00'), bank_total=Decimal('3500.00'),
            bank_only_total=Decimal('2500.00'), net_worth=Decimal('33500.00'), saxo_account_value=Decimal('31000.00'),
        )
        snapshot.objects.create(
            user=user, date=date(2026, 9, 2), portfolio_value=Decimal('30500.00'), bank_total=Decimal('1000.00'),
            bank_only_total=None, net_worth=Decimal('31500.00'), saxo_account_value=Decimal('31500.00'),
        )

        apps = self.migrate(CORE_RESTATED)

        rows = apps.get_model('core', 'NetWorthSnapshot').objects.order_by('date')
        self.assertEqual(
            [(row.bank_total, row.net_worth, row.saxo_account_value) for row in rows],
            [
                (Decimal('1000.00'), Decimal('31000.00'), Decimal('31000.00')),
                (Decimal('1000.00'), Decimal('31500.00'), Decimal('31500.00')),
            ],
        )

    def test_the_bank_only_column_is_dropped(self):
        apps = self.migrate(CORE_DROPPED)
        fields = {field.name for field in apps.get_model('core', 'NetWorthSnapshot')._meta.get_fields()}
        self.assertNotIn('bank_only_total', fields)
