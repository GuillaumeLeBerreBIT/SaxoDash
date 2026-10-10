from datetime import date
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import BankAccount

from .models import BankTransaction


def _auth_client(test_case):
    user = User.objects.create_user(username='u1', password='p')
    token = RefreshToken.for_user(user).access_token
    test_case.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


class ReviewQueueTestCase(APITestCase):
    def setUp(self):
        _auth_client(self)
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def make(self, external_id, **fields):
        defaults = dict(
            bank='kbc', bank_account=self.account, external_id=external_id, amount=-10,
            currency='EUR', booking_date=date(2026, 1, 5), category='OTHER',
        )
        defaults.update(fields)
        return BankTransaction.objects.create(**defaults)


class NeedsReviewFilterTest(ReviewQueueTestCase):
    def ids_needing_review(self):
        response = self.client.get('/api/enablebanking/transactions/?needs_review=true')
        self.assertEqual(response.status_code, 200)
        return {row['id'] for row in response.data}

    def test_unreviewed_other_without_override_is_listed(self):
        tx = self.make('t1')
        self.assertEqual(self.ids_needing_review(), {tx.id})

    def test_categorised_rows_are_not_listed(self):
        self.make('t1', category='GROCERIES')
        self.assertEqual(self.ids_needing_review(), set())

    def test_overridden_rows_are_not_listed(self):
        self.make('t1', category_override='DINING')
        self.assertEqual(self.ids_needing_review(), set())

    def test_reviewed_rows_are_not_listed(self):
        self.make('t1', reviewed=True)
        self.assertEqual(self.ids_needing_review(), set())

    def test_without_the_filter_every_row_is_listed(self):
        self.make('t1')
        self.make('t2', reviewed=True)
        response = self.client.get('/api/enablebanking/transactions/')
        self.assertEqual(len(response.data), 2)

    def test_needs_review_false_is_not_a_filter(self):
        self.make('t1')
        self.make('t2', reviewed=True)
        response = self.client.get('/api/enablebanking/transactions/?needs_review=false')
        self.assertEqual(len(response.data), 2)

    def test_serializer_exposes_reviewed(self):
        self.make('t1', reviewed=True)
        response = self.client.get('/api/enablebanking/transactions/')
        self.assertTrue(response.data[0]['reviewed'])


class ReviewMarkingTest(ReviewQueueTestCase):
    def setUp(self):
        super().setUp()
        self.tx = self.make('t1')
        self.url = f'/api/enablebanking/transactions/{self.tx.id}/category/'

    def test_assigning_a_category_marks_reviewed(self):
        response = self.client.patch(self.url, {'category_override': 'DINING'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.tx.refresh_from_db()
        self.assertEqual(self.tx.category_override, 'DINING')
        self.assertTrue(self.tx.reviewed)

    def test_reviewed_alone_keeps_the_category_untouched(self):
        response = self.client.patch(self.url, {'reviewed': True}, format='json')
        self.assertEqual(response.status_code, 200)
        self.tx.refresh_from_db()
        self.assertTrue(self.tx.reviewed)
        self.assertIsNone(self.tx.category_override)
        self.assertEqual(self.tx.category, 'OTHER')

    def test_clearing_an_override_leaves_reviewed_alone(self):
        self.tx.category_override = 'DINING'
        self.tx.reviewed = True
        self.tx.save()
        self.client.patch(self.url, {'category_override': None}, format='json')
        self.tx.refresh_from_db()
        self.assertIsNone(self.tx.category_override)
        self.assertTrue(self.tx.reviewed)

    def test_reviewed_must_be_boolean(self):
        response = self.client.patch(self.url, {'reviewed': 'maybe'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.tx.refresh_from_db()
        self.assertFalse(self.tx.reviewed)

    def test_empty_body_is_rejected(self):
        response = self.client.patch(self.url, {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_unknown_category_does_not_mark_reviewed(self):
        self.client.patch(self.url, {'category_override': 'NOT_REAL'}, format='json')
        self.tx.refresh_from_db()
        self.assertFalse(self.tx.reviewed)


class SyncPreservesReviewedTest(ReviewQueueTestCase):
    def test_persist_does_not_reset_reviewed(self):
        from .tasks import _persist

        tx = self.make('t1', reviewed=True, category_override='DINING')
        batch = [BankTransaction(
            bank='kbc', bank_account=self.account, external_id='t1', amount=-10, currency='EUR',
            booking_date=date(2026, 1, 5), category='OTHER',
        )]
        _persist(batch)
        tx.refresh_from_db()
        self.assertTrue(tx.reviewed)
        self.assertEqual(tx.category_override, 'DINING')


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class SyncNowViewTest(APITestCase):
    url = '/api/enablebanking/sync/'

    def setUp(self):
        cache.clear()
        _auth_client(self)

    def test_requires_authentication(self):
        self.client.credentials()
        self.assertEqual(self.client.post(self.url).status_code, 401)

    def test_queues_both_bank_tasks(self):
        with patch('enablebanking.views.tasks.sync_enablebanking_balances.delay') as balances, \
                patch('enablebanking.views.tasks.sync_enablebanking_transactions.delay') as transactions:
            response = self.client.post(self.url)
        self.assertEqual(response.status_code, 202)
        balances.assert_called_once_with()
        transactions.assert_called_once_with()

    def test_answers_503_when_the_queue_is_unreachable(self):
        with patch('enablebanking.views.tasks.sync_enablebanking_balances.delay', side_effect=OSError('redis')), \
                patch('enablebanking.views.tasks.sync_enablebanking_transactions.delay'):
            response = self.client.post(self.url)
        self.assertEqual(response.status_code, 503)

    def test_is_post_only(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)


@patch.dict(ScopedRateThrottle.THROTTLE_RATES, {'enablebanking.sync': '3/min'})
@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class SyncNowThrottleTest(APITestCase):
    def setUp(self):
        cache.clear()
        _auth_client(self)

    def test_is_throttled_past_its_scope_rate(self):
        with patch('enablebanking.views.tasks.sync_enablebanking_balances.delay'), \
                patch('enablebanking.views.tasks.sync_enablebanking_transactions.delay'):
            codes = [self.client.post('/api/enablebanking/sync/').status_code for _ in range(4)]
        self.assertEqual(codes[:3], [202, 202, 202])
        self.assertEqual(codes[3], 429)


class SyncNowScopeConfigTest(TestCase):
    def test_scope_has_a_configured_rate(self):
        from . import views

        self.assertIn(views.SyncNowView.throttle_scope, settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'])
