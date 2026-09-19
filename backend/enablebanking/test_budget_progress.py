from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase

from accounts.models import BankAccount

from .models import BankTransaction, Budget
from .services import budget_progress


class BudgetProgressTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def _tx(self, amount, category, booking_date, external_id, category_override=None):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id=external_id,
            amount=amount, currency='EUR', booking_date=booking_date,
            category=category, category_override=category_override,
        )

    def test_computes_spent_and_pct_for_current_month(self):
        Budget.objects.create(category='GROCERIES', monthly_limit=Decimal('100'))
        self._tx(Decimal('-40'), 'GROCERIES', date.today().replace(day=1), 't1')

        row = next(r for r in budget_progress() if r['category'] == 'GROCERIES')

        self.assertEqual(row['spent'], Decimal('40'))
        self.assertEqual(row['limit'], Decimal('100'))
        self.assertEqual(row['pct'], 40.0)

    def test_ignores_transactions_outside_current_month(self):
        Budget.objects.create(category='GROCERIES', monthly_limit=Decimal('100'))
        last_month_day = date.today().replace(day=1) - timedelta(days=1)
        self._tx(Decimal('-40'), 'GROCERIES', last_month_day, 't1')

        row = next(r for r in budget_progress() if r['category'] == 'GROCERIES')

        self.assertEqual(row['spent'], Decimal('0'))

    def test_respects_category_override(self):
        Budget.objects.create(category='DINING', monthly_limit=Decimal('50'))
        self._tx(Decimal('-40'), 'GROCERIES', date.today().replace(day=1), 't1', category_override='DINING')

        row = next(r for r in budget_progress() if r['category'] == 'DINING')

        self.assertEqual(row['spent'], Decimal('40'))

    def test_zero_spend_reports_pct_zero_not_an_error(self):
        Budget.objects.create(category='TRAVEL', monthly_limit=Decimal('200'))

        row = next(r for r in budget_progress() if r['category'] == 'TRAVEL')

        self.assertEqual(row['spent'], Decimal('0'))
        self.assertEqual(row['pct'], 0.0)

    def test_category_with_spend_but_no_budget_is_absent(self):
        self._tx(Decimal('-40'), 'GROCERIES', date.today().replace(day=1), 't1')

        self.assertEqual(budget_progress(), [])

    def test_exceeding_budget_reports_over_100_pct_uncapped(self):
        Budget.objects.create(category='SHOPPING', monthly_limit=Decimal('50'))
        self._tx(Decimal('-71'), 'SHOPPING', date.today().replace(day=1), 't1')

        row = next(r for r in budget_progress() if r['category'] == 'SHOPPING')

        self.assertEqual(row['pct'], 142.0)
