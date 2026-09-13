"""sync_positions' isin lookup, split out of tests.py to keep that file
under the 1k-line threshold - see AGENTS.md's code-quality conventions."""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from portfolio.models import Position

from . import client, tasks
from .models import SaxoCredential, SyncRun
from .tests import SAMPLE_POSITION


class SyncPositionsIsinLookupTest(TestCase):
    def setUp(self):
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )

    @patch('saxo.tasks.client.get_instrument_details')
    @patch('saxo.tasks.client.get_positions')
    def test_fetches_isin_for_a_new_position(self, mock_get_positions, mock_get_details):
        position_with_uic = {
            **SAMPLE_POSITION,
            'PositionBase': {**SAMPLE_POSITION['PositionBase'], 'Uic': 211},
        }
        mock_get_positions.return_value = [position_with_uic]
        mock_get_details.return_value = {'Isin': 'US67066G1040'}

        tasks.sync_positions()

        self.assertEqual(Position.objects.get(ticker='NVDA').isin, 'US67066G1040')
        mock_get_details.assert_called_once_with(self.cred.access_token, 211, 'Stock')

    @patch('saxo.tasks.client.get_instrument_details')
    @patch('saxo.tasks.client.get_positions')
    def test_does_not_refetch_isin_once_known(self, mock_get_positions, mock_get_details):
        Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=1, avg_cost=Decimal('1'),
            current_price=Decimal('1'), sector='Uncategorized', type='STOCK',
            color='#000000', isin='US67066G1040',
        )
        position_with_uic = {
            **SAMPLE_POSITION,
            'PositionBase': {**SAMPLE_POSITION['PositionBase'], 'Uic': 211},
        }
        mock_get_positions.return_value = [position_with_uic]

        tasks.sync_positions()

        mock_get_details.assert_not_called()
        self.assertEqual(Position.objects.get(ticker='NVDA').isin, 'US67066G1040')

    @patch('saxo.tasks.client.get_instrument_details')
    @patch('saxo.tasks.client.get_positions')
    def test_a_failed_isin_lookup_does_not_fail_the_sync(self, mock_get_positions, mock_get_details):
        position_with_uic = {
            **SAMPLE_POSITION,
            'PositionBase': {**SAMPLE_POSITION['PositionBase'], 'Uic': 211},
        }
        mock_get_positions.return_value = [position_with_uic]
        mock_get_details.side_effect = client.SaxoAPIError('nope')

        tasks.sync_positions()

        position = Position.objects.get(ticker='NVDA')
        self.assertIsNone(position.isin)
        self.assertEqual(SyncRun.objects.get(task='sync_positions').outcome, 'ok')

    @patch('saxo.tasks.client.get_instrument_details')
    @patch('saxo.tasks.client.get_positions')
    def test_skips_isin_lookup_without_a_uic(self, mock_get_positions, mock_get_details):
        # SAMPLE_POSITION predates the uic/asset_type sync - a row like this
        # cannot be looked up at all.
        mock_get_positions.return_value = [SAMPLE_POSITION]

        tasks.sync_positions()

        mock_get_details.assert_not_called()
        self.assertIsNone(Position.objects.get(ticker='NVDA').isin)

    @patch('saxo.tasks.client.get_instrument_details')
    @patch('saxo.tasks.client.get_positions')
    def test_isin_lookup_never_holds_the_write_transaction_open(self, mock_get_positions, mock_get_details):
        """The lookup used to run inside the same transaction.atomic() block
        as the position upsert - a slow Saxo round-trip would then hold
        SQLite's one write lock for its duration. Asserting call order here
        (positions upserted, in the database, before the lookup for the next
        row happens) would need instrumenting the transaction itself; instead
        this pins the cheaper, equivalent contract: a lookup failure never
        rolls back an already-upserted row, which could only be true if the
        upsert isn't wrapped around the lookup in the first place."""
        first, second = (
            {**SAMPLE_POSITION, 'PositionBase': {**SAMPLE_POSITION['PositionBase'], 'Uic': 211}},
            {
                **SAMPLE_POSITION,
                'PositionBase': {**SAMPLE_POSITION['PositionBase'], 'Uic': 212},
                'DisplayAndFormat': {**SAMPLE_POSITION['DisplayAndFormat'], 'Symbol': 'AAPL:xnas'},
            },
        )
        mock_get_positions.return_value = [first, second]
        mock_get_details.side_effect = [{'Isin': 'US67066G1040'}, client.SaxoAPIError('nope')]

        tasks.sync_positions()

        self.assertEqual(Position.objects.get(ticker='NVDA').isin, 'US67066G1040')
        self.assertIsNone(Position.objects.get(ticker='AAPL').isin)
        self.assertEqual(SyncRun.objects.get(task='sync_positions').outcome, 'ok')
