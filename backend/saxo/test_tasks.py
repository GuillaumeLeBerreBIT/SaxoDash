from datetime import timedelta
from unittest.mock import patch
from decimal import Decimal
import inspect
from django.test import TestCase, override_settings
from django.utils import timezone
from portfolio.models import SAXO_SOURCE, PortfolioValuation, Position
from transactions.models import Transaction
from accounts.models import BankAccount
from .models import SaxoCredential, SyncRun
from . import client, mapping, tasks

SAMPLE_POSITION = {
    'PositionId': '5027270864',
    'PositionBase': {
        'Amount': 15,
        'OpenPrice': 412.30,
        'AssetType': 'Stock',
        'ExecutionTimeOpen': '2026-08-26T18:30:31.645781Z',
    },
    'PositionView': {
        'CurrentPrice': 875.40,
    },
    'DisplayAndFormat': {
        'Symbol': 'NVDA:xnas',
        'Description': 'NVIDIA Corporation',
        'Currency': 'EUR',
    },
}

SAMPLE_CLOSED_POSITION = {
    'ClosedPositionUniqueId': '5027270864-5027484376',
    'ClosedPosition': {
        'Amount': 10.0,
        'AssetType': 'Stock',
        'BuyOrSell': 'Buy',
        'ClosingPrice': 678.43,
        'ExecutionTimeClose': '2026-09-16T19:06:38.216089Z',
        'ExecutionTimeOpen': '2026-08-26T18:30:31.645781Z',
    },
    'DisplayAndFormat': {
        'Currency': 'USD',
        'Description': 'Meta Platforms Inc.',
        'Symbol': 'META:xnas',
    },
}

UNENTITLED_POSITION = {
    'PositionId': '5027270852',
    'PositionBase': {
        'Amount': 20.0,
        'OpenPrice': 494.36,
        'AssetType': 'Stock',
        'Uic': 261,
        'ExecutionTimeOpen': '2026-08-26T18:30:31.645781Z',
    },
    'PositionView': {
        'CurrentPrice': 0.0,
        'CurrentPriceType': 'None',
        'MarketValue': 0.0,
        'ProfitLossOnTrade': 314.60,
        'ConversionRateCurrent': 0.8600895,
    },
    'DisplayAndFormat': {
        'Symbol': 'MSFT:xnas',
        'Description': 'Microsoft Corp.',
        'Currency': 'USD',
    },
}


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class RefreshSaxoTokenTaskTest(TestCase):
    def test_does_nothing_when_token_not_near_expiry(self):
        SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )
        with patch('saxo.tasks.client.refresh_access_token') as mock_refresh:
            tasks.refresh_saxo_token()
            mock_refresh.assert_not_called()

    @patch('saxo.tasks.client.refresh_access_token')
    def test_refreshes_when_near_expiry(self, mock_refresh):
        mock_refresh.return_value = {
            'access_token': 'new-a', 'refresh_token': 'new-b', 'expires_in': 1200,
        }
        cred = SaxoCredential.objects.create(
            access_token='old-a', refresh_token='old-b',
            expires_at=timezone.now() + timedelta(minutes=2),
        )
        tasks.refresh_saxo_token()
        cred.refresh_from_db()
        self.assertEqual(cred.access_token, 'new-a')
        self.assertFalse(cred.needs_reauth)

    @patch('saxo.tasks.client.refresh_access_token')
    def test_marks_needs_reauth_on_failure(self, mock_refresh):
        mock_refresh.side_effect = client.SaxoAuthError('expired')
        cred = SaxoCredential.objects.create(
            access_token='old-a', refresh_token='old-b',
            expires_at=timezone.now() + timedelta(minutes=2),
        )
        tasks.refresh_saxo_token()
        cred.refresh_from_db()
        self.assertTrue(cred.needs_reauth)


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SyncPositionsTaskTest(TestCase):
    def setUp(self):
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )

    @patch('saxo.tasks.client.get_positions')
    def test_creates_positions_from_saxo_data(self, mock_get_positions):
        mock_get_positions.return_value = [SAMPLE_POSITION]
        tasks.sync_positions()
        self.assertEqual(Position.objects.count(), 1)
        self.assertEqual(Position.objects.first().ticker, 'NVDA')

        run = SyncRun.objects.get(task='sync_positions')
        self.assertEqual(run.outcome, 'ok')
        self.assertEqual(run.rows, 1)

    @patch('saxo.tasks.client.get_positions')
    def test_removes_positions_no_longer_present(self, mock_get_positions):
        Position.objects.create(
            ticker='OLD', name='Old Corp', qty=1, avg_cost=Decimal('1'),
            current_price=Decimal('1'), sector='Uncategorized', type='STOCK', color='#000000',
        )
        mock_get_positions.return_value = [SAMPLE_POSITION]
        tasks.sync_positions()
        self.assertFalse(Position.objects.filter(ticker='OLD').exists())
        self.assertTrue(Position.objects.filter(ticker='NVDA').exists())

    @patch('saxo.tasks.client.get_positions')
    def test_skips_malformed_rows_without_aborting(self, mock_get_positions):
        mock_get_positions.return_value = [{'unexpected': 'shape'}, SAMPLE_POSITION]
        tasks.sync_positions()
        self.assertEqual(Position.objects.count(), 1)
        self.assertEqual(Transaction.objects.count(), 1)

    @patch('saxo.tasks.client.get_positions')
    def test_all_rows_failing_to_map_does_not_wipe_the_portfolio(self, mock_get_positions):
        # exclude(ticker__in=[]) matches every row, so an unguarded prune here
        # deletes the whole book on a payload we simply failed to read.
        Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=1, avg_cost=Decimal('1'),
            current_price=Decimal('1'), sector='Uncategorized', type='STOCK',
            color='#000000',
        )
        mock_get_positions.return_value = [{'unexpected': 'shape'}]
        with self.assertRaises(tasks.SyncRefused):
            tasks.sync_positions()

        self.assertTrue(Position.objects.filter(ticker='NVDA').exists())
        self.assertEqual(SyncRun.objects.get(task='sync_positions').outcome, 'failed')

    @patch('saxo.tasks.client.get_positions')
    def test_an_empty_saxo_response_still_prunes(self, mock_get_positions):
        # Holding nothing is a real answer, and differs from failing to read.
        Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=1, avg_cost=Decimal('1'),
            current_price=Decimal('1'), sector='Uncategorized', type='STOCK',
            color='#000000',
        )
        mock_get_positions.return_value = []
        tasks.sync_positions()

        self.assertEqual(Position.objects.count(), 0)

    @patch('saxo.tasks.client.get_positions')
    def test_records_the_price_provenance(self, mock_get_positions):
        mock_get_positions.return_value = [UNENTITLED_POSITION]
        tasks.sync_positions()

        position = Position.objects.get(ticker='MSFT')
        self.assertEqual(position.price_source, 'derived')
        self.assertEqual(position.currency, 'USD')
        self.assertIsNotNone(position.priced_at)

    @patch('saxo.tasks.client.get_positions')
    def test_also_creates_a_transaction_from_the_same_fetch(self, mock_get_positions):
        # One Saxo response maps into both tables, so they can no longer
        # diverge by running on different schedules.
        mock_get_positions.return_value = [SAMPLE_POSITION]
        tasks.sync_positions()

        self.assertEqual(Transaction.objects.count(), 1)
        txn = Transaction.objects.first()
        self.assertEqual(txn.saxo_trade_id, '5027270864')
        self.assertEqual(txn.type, 'BUY')
        self.assertEqual(txn.ticker, 'NVDA')

    @patch('saxo.tasks.client.get_positions')
    def test_transaction_upserts_on_repeated_sync(self, mock_get_positions):
        mock_get_positions.return_value = [SAMPLE_POSITION]
        tasks.sync_positions()
        tasks.sync_positions()
        self.assertEqual(Transaction.objects.count(), 1)


class SyncClosedPositionsTaskTest(TestCase):
    def setUp(self):
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )

    @patch('saxo.tasks.client.get_closed_positions')
    def test_creates_a_sell_transaction_from_saxo_data(self, mock_get_closed_positions):
        mock_get_closed_positions.return_value = [SAMPLE_CLOSED_POSITION]
        tasks.sync_closed_positions()

        self.assertEqual(Transaction.objects.count(), 1)
        txn = Transaction.objects.first()
        self.assertEqual(txn.saxo_trade_id, '5027270864-5027484376')
        self.assertEqual(txn.type, 'SELL')
        self.assertEqual(txn.ticker, 'META')

        run = SyncRun.objects.get(task='sync_closed_positions')
        self.assertEqual(run.outcome, 'ok')
        self.assertEqual(run.rows, 1)

    @patch('saxo.tasks.client.get_closed_positions')
    def test_skips_malformed_rows_without_aborting(self, mock_get_closed_positions):
        mock_get_closed_positions.return_value = [{'unexpected': 'shape'}, SAMPLE_CLOSED_POSITION]
        tasks.sync_closed_positions()
        self.assertEqual(Transaction.objects.count(), 1)

    @patch('saxo.tasks.client.get_closed_positions')
    def test_transaction_upserts_on_repeated_sync(self, mock_get_closed_positions):
        mock_get_closed_positions.return_value = [SAMPLE_CLOSED_POSITION]
        tasks.sync_closed_positions()
        tasks.sync_closed_positions()
        self.assertEqual(Transaction.objects.count(), 1)

    @patch('saxo.tasks.client.get_closed_positions')
    def test_empty_result_completes_as_ok_not_failed(self, mock_get_closed_positions):
        # Regression for the 2026-09-20 production failure: an empty result
        # (client.get_closed_positions correctly normalizes a bare [] to [])
        # must record a normal completion, not an AttributeError bubbling up
        # through the @synced wrapper as outcome='failed'.
        mock_get_closed_positions.return_value = []
        tasks.sync_closed_positions()

        run = SyncRun.objects.get(task='sync_closed_positions')
        self.assertEqual(run.outcome, 'ok')
        self.assertEqual(run.rows, 0)


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class ExpiredCredentialGuardTest(TestCase):
    """The sync tasks must not call Saxo with an access token that has expired.

    Doing so returns 401, which raises SaxoAPIError and burns all three
    autoretries on a request that cannot succeed. refresh_saxo_token is what
    repairs the credential, so the sync tasks skip and pick it up next tick.
    """

    def setUp(self):
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() - timedelta(minutes=1),
        )

    @patch('saxo.tasks.client.get_positions')
    def test_sync_positions_skips_expired_token(self, mock_get_positions):
        tasks.sync_positions()
        mock_get_positions.assert_not_called()
        self.assertEqual(Position.objects.count(), 0)

    @patch('saxo.tasks.client.get_account_balance')
    def test_sync_account_balance_skips_expired_token(self, mock_get_balance):
        tasks.sync_account_balance()
        mock_get_balance.assert_not_called()

    @patch('saxo.tasks.client.get_positions')
    def test_unexpired_token_still_syncs(self, mock_get_positions):
        self.cred.expires_at = timezone.now() + timedelta(hours=1)
        self.cred.save(update_fields=['expires_at'])
        mock_get_positions.return_value = [SAMPLE_POSITION]
        tasks.sync_positions()
        mock_get_positions.assert_called_once()

    @patch('saxo.tasks.client.refresh_access_token')
    def test_refresh_task_still_runs_on_expired_token(self, mock_refresh):
        # The guard must NOT apply here: an expired access token is precisely
        # this task's trigger. It authenticates with the refresh token.
        mock_refresh.return_value = {
            'access_token': 'new-a', 'refresh_token': 'new-b', 'expires_in': 1200,
        }
        tasks.refresh_saxo_token()
        mock_refresh.assert_called_once()
        self.cred.refresh_from_db()
        self.assertEqual(self.cred.access_token, 'new-a')
        self.assertGreater(self.cred.expires_at, timezone.now())


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SyncAccountBalanceTaskTest(TestCase):
    def setUp(self):
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )

    @patch('saxo.tasks.client.get_account_balance')
    def test_updates_the_synced_account_in_place(self, mock_get_balance):
        BankAccount.objects.create(
            bank='Saxo', type='Cash', iban_masked='-',
            balance=Decimal('850.00'), available=Decimal('850.00'),
            external_id=mapping.SAXO_CASH_ACCOUNT_ID,
        )
        mock_get_balance.return_value = {
            'CashBalance': 994104.45, 'CollateralAvailable': 992000.10,
            'Currency': 'EUR', 'NonMarginPositionsValue': 31571.91,
            'TotalValue': 1025676.36,
        }
        tasks.sync_account_balance()

        self.assertEqual(BankAccount.objects.count(), 1)
        account = BankAccount.objects.get(external_id=mapping.SAXO_CASH_ACCOUNT_ID)
        self.assertEqual(account.balance, Decimal('994104.45'))
        self.assertEqual(account.available, Decimal('992000.10'))

    @patch('saxo.tasks.client.get_account_balance')
    def test_records_saxos_own_valuation(self, mock_get_balance):
        mock_get_balance.return_value = {
            'CashBalance': 968435.55, 'CollateralAvailable': 968435.55,
            'Currency': 'EUR', 'NonMarginPositionsValue': 31571.91,
            'TotalValue': 1000007.46,
        }
        tasks.sync_account_balance()

        valuation = PortfolioValuation.objects.get(source=SAXO_SOURCE)
        self.assertEqual(valuation.currency, 'EUR')
        self.assertEqual(valuation.positions_value, Decimal('31571.91'))
        self.assertEqual(valuation.total_value, Decimal('1000007.46'))
        # The identity that makes this figure trustworthy.
        self.assertEqual(valuation.total_value - valuation.cash_balance,
                         valuation.positions_value)

    @patch('saxo.tasks.client.get_account_balance')
    def test_a_balance_without_a_valuation_writes_none(self, mock_get_balance):
        mock_get_balance.return_value = {
            'CashBalance': 100.00, 'CollateralAvailable': 100.00,
        }
        tasks.sync_account_balance()

        self.assertEqual(BankAccount.objects.count(), 1)
        self.assertFalse(PortfolioValuation.objects.exists())

    @patch('saxo.tasks.client.get_account_balance')
    def test_creates_the_row_when_absent(self, mock_get_balance):
        mock_get_balance.return_value = {
            'CashBalance': 100.00, 'CollateralAvailable': 100.00,
            'Currency': 'EUR', 'NonMarginPositionsValue': 0.00,
            'TotalValue': 100.00,
        }
        tasks.sync_account_balance()

        account = BankAccount.objects.get(external_id=mapping.SAXO_CASH_ACCOUNT_ID)
        self.assertEqual(account.balance, Decimal('100.00'))
        self.assertEqual(account.bank, 'Saxo')

    @patch('saxo.tasks.client.get_account_balance')
    def test_second_account_at_the_same_bank_does_not_break_the_sync(self, mock_get_balance):
        # update_or_create(bank='Saxo') raised MultipleObjectsReturned here.
        BankAccount.objects.create(
            bank='Saxo', type='Cash', iban_masked='-',
            balance=Decimal('850.00'), available=Decimal('850.00'),
            external_id=mapping.SAXO_CASH_ACCOUNT_ID,
        )
        BankAccount.objects.create(
            bank='Saxo', type='Savings', iban_masked='-',
            balance=Decimal('25.00'), available=Decimal('25.00'),
        )
        mock_get_balance.return_value = {
            'CashBalance': 300.00, 'CollateralAvailable': 300.00,
            'Currency': 'EUR', 'NonMarginPositionsValue': 0.00,
            'TotalValue': 300.00,
        }
        tasks.sync_account_balance()

        self.assertEqual(BankAccount.objects.filter(bank='Saxo').count(), 2)
        self.assertEqual(
            BankAccount.objects.get(external_id=mapping.SAXO_CASH_ACCOUNT_ID).balance,
            Decimal('300.00'),
        )
        # the hand-entered account is untouched
        self.assertEqual(
            BankAccount.objects.get(type='Savings').balance, Decimal('25.00')
        )


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class ScheduledTaskSignatureTest(TestCase):
    """Beat sends these with no arguments; the tests used to call them directly.

    Calling `tasks.sync_positions()` goes through Task.__call__ and never sees
    Celery's argument check, so `@synced` reporting the wrapped function's
    signature - credential and all - was invisible here while beat failed on
    every tick with "missing 1 required positional argument: 'credential'".
    """

    @patch('saxo.tasks.client.get_closed_positions')
    @patch('saxo.tasks.client.get_positions')
    @patch('saxo.tasks.client.get_account_balance')
    def test_beat_can_dispatch_every_scheduled_sync(self, mock_balance, mock_positions, mock_closed_positions):
        mock_positions.return_value = []
        mock_closed_positions.return_value = []
        mock_balance.return_value = {
            'CashBalance': 100, 'CollateralAvailable': 100, 'Currency': 'EUR',
            'NonMarginPositionsValue': 0, 'TotalValue': 100,
        }

        for task in (tasks.sync_positions, tasks.sync_closed_positions,
                     tasks.sync_account_balance, tasks.refresh_saxo_token):
            with self.subTest(task=task.name):
                task.delay()

    def test_a_synced_task_reports_the_arguments_its_callers_pass(self):
        self.assertEqual(str(inspect.signature(tasks.sync_positions.run)), '()')


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SyncRunTest(TestCase):
    """D4: a sync that could not run used to be logged as a success."""

    @patch('saxo.tasks.client.get_positions')
    def test_a_skipped_sync_is_recorded_as_skipped(self, mock_get_positions):
        # No credential at all.
        tasks.sync_positions()

        run = SyncRun.objects.get(task='sync_positions')
        self.assertEqual(run.outcome, 'skipped')
        self.assertIn('not connected', run.detail)
        mock_get_positions.assert_not_called()

    @patch('saxo.tasks.client.get_positions')
    def test_an_expired_token_is_recorded_with_its_reason(self, mock_get_positions):
        SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        tasks.sync_positions()

        run = SyncRun.objects.get(task='sync_positions')
        self.assertEqual(run.outcome, 'skipped')
        self.assertIn('expired', run.detail)

    @patch('saxo.tasks.client.get_positions')
    def test_a_failing_sync_is_recorded_and_still_raises(self, mock_get_positions):
        SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )
        mock_get_positions.side_effect = client.SaxoAPIError('gateway said no')

        with self.assertRaises(client.SaxoAPIError):
            tasks.sync_positions()

        self.assertEqual(SyncRun.objects.first().outcome, 'failed')
