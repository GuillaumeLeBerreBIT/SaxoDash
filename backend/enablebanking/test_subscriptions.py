from datetime import date

from django.test import TestCase

from accounts.models import BankAccount

from .models import BankTransaction, Subscription
from .subscriptions import detect_subscriptions


class DetectSubscriptionsTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def _charge(self, merchant, amount, booking_date, external_id, category='SUBSCRIPTIONS'):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id=external_id,
            amount=amount, currency='EUR', booking_date=booking_date,
            counterparty_name=merchant, category=category,
        )

    def test_detects_a_monthly_pattern(self):
        self._charge('NETFLIX.COM', -12.99, date(2026, 1, 3), 'n1')
        self._charge('NETFLIX.COM', -12.99, date(2026, 2, 3), 'n2')
        self._charge('NETFLIX.COM', -12.99, date(2026, 3, 4), 'n3')

        count = detect_subscriptions()

        self.assertEqual(count, 1)
        sub = Subscription.objects.get(merchant_key='NETFLIX.COM')
        self.assertEqual(sub.cadence, 'monthly')
        self.assertEqual(sub.last_charged, date(2026, 3, 4))

    def test_single_occurrence_is_not_a_subscription(self):
        self._charge('ONE OFF SHOP', -50, date(2026, 1, 3), 'o1')
        self.assertEqual(detect_subscriptions(), 0)

    def test_irregular_cadence_is_not_a_subscription(self):
        self._charge('IRREGULAR', -20, date(2026, 1, 3), 'r1')
        self._charge('IRREGULAR', -20, date(2026, 1, 18), 'r2')
        self.assertEqual(detect_subscriptions(), 0)

    def test_unstable_amount_is_not_a_subscription(self):
        self._charge('VARIABLE', -10, date(2026, 1, 1), 'v1')
        self._charge('VARIABLE', -40, date(2026, 2, 1), 'v2')
        self.assertEqual(detect_subscriptions(), 0)

    def test_transfers_are_excluded_from_detection(self):
        self._charge('OWN OTHER ACCOUNT', -500, date(2026, 1, 1), 't1', category='TRANSFER')
        self._charge('OWN OTHER ACCOUNT', -500, date(2026, 2, 1), 't2', category='TRANSFER')
        self.assertEqual(detect_subscriptions(), 0)

    def test_a_regular_cash_withdrawal_is_not_a_subscription(self):
        # Real KBC data (2026-09-22): a habitual monthly ATM withdrawal of a
        # similar amount is mechanically indistinguishable from a merchant
        # charge by amount/cadence alone, but "Geldopneming" (Dutch: cash
        # withdrawal) on the counterparty is an unambiguous signal - no
        # interpretation makes a cash withdrawal a subscription.
        self._charge('Geldopneming via Bancontact', -40, date(2026, 1, 3), 'w1', category='UTILITIES')
        self._charge('Geldopneming via Bancontact', -40, date(2026, 2, 3), 'w2', category='UTILITIES')
        self._charge('Geldopneming via Bancontact', -40, date(2026, 3, 4), 'w3', category='UTILITIES')
        self.assertEqual(detect_subscriptions(), 0)

    def test_rerun_preserves_dismissed_flag(self):
        self._charge('NETFLIX.COM', -12.99, date(2026, 1, 3), 'n1')
        self._charge('NETFLIX.COM', -12.99, date(2026, 2, 3), 'n2')
        detect_subscriptions()
        sub = Subscription.objects.get(merchant_key='NETFLIX.COM')
        sub.dismissed = True
        sub.save()

        self._charge('NETFLIX.COM', -12.99, date(2026, 3, 4), 'n3')
        detect_subscriptions()

        sub.refresh_from_db()
        self.assertTrue(sub.dismissed)
        self.assertEqual(sub.last_charged, date(2026, 3, 4))
