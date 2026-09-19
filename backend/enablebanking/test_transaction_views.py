from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import BankAccount

from .models import BankTransaction, Budget, Subscription


def _auth_client(test_case, username):
    user = User.objects.create_user(username=username, password='p')
    token = RefreshToken.for_user(user).access_token
    test_case.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


class BankTransactionListViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u1')
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='t1', amount=-40,
            currency='EUR', booking_date=date(2026, 1, 5), category='GROCERIES',
        )
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='t2', amount=-15,
            currency='EUR', booking_date=date(2026, 1, 10), category='DINING',
        )

    def test_lists_all_transactions(self):
        response = self.client.get('/api/enablebanking/transactions/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_filters_by_category(self):
        response = self.client.get('/api/enablebanking/transactions/?category=DINING')
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['category'], 'DINING')

    def test_filters_by_account(self):
        response = self.client.get(f'/api/enablebanking/transactions/?account={self.account.id}')
        self.assertEqual(len(response.data), 2)

    def test_returns_all_transactions_without_pagination(self):
        # Verify that more than the default page size (20) are all returned
        for i in range(25):
            BankTransaction.objects.create(
                bank='kbc', bank_account=self.account, external_id=f'extra_t{i}', amount=-10,
                currency='EUR', booking_date=date(2026, 1, 15), category='GROCERIES',
            )
        response = self.client.get(f'/api/enablebanking/transactions/?account={self.account.id}')
        # Should return all 27 transactions (25 + 2 from setUp), not just 20
        self.assertEqual(len(response.data), 27)


class BankTransactionCategoryViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u2')
        account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        self.tx = BankTransaction.objects.create(
            bank='kbc', bank_account=account, external_id='t1', amount=-40,
            currency='EUR', booking_date=date(2026, 1, 5), category='GROCERIES',
        )

    def test_sets_category_override(self):
        response = self.client.patch(
            f'/api/enablebanking/transactions/{self.tx.id}/category/',
            {'category_override': 'DINING'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.tx.refresh_from_db()
        self.assertEqual(self.tx.category_override, 'DINING')

    def test_clears_category_override(self):
        self.tx.category_override = 'DINING'
        self.tx.save()
        response = self.client.patch(
            f'/api/enablebanking/transactions/{self.tx.id}/category/',
            {'category_override': None}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.tx.refresh_from_db()
        self.assertIsNone(self.tx.category_override)

    def test_rejects_an_unknown_category(self):
        response = self.client.patch(
            f'/api/enablebanking/transactions/{self.tx.id}/category/',
            {'category_override': 'NOT_REAL'}, format='json',
        )
        self.assertEqual(response.status_code, 400)


class SpendingSummaryViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u3')
        account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        BankTransaction.objects.create(
            bank='kbc', bank_account=account, external_id='t1', amount=-40,
            currency='EUR', booking_date=date(2026, 1, 5), category='GROCERIES',
        )

    def test_returns_the_summary_shape(self):
        response = self.client.get('/api/enablebanking/spending/summary/')
        self.assertEqual(response.status_code, 200)
        # Decimal('40'), matching test_spending_service.py - .data keeps the
        # raw Decimal, so Decimal('40') != '40.00' by definition.
        self.assertEqual(response.data['total'], Decimal('40'))

    def test_includes_previous_period_and_transaction_count(self):
        response = self.client.get('/api/enablebanking/spending/summary/?date_from=2026-01-01&date_to=2026-01-31')
        self.assertEqual(response.data['transaction_count'], 1)
        self.assertEqual(response.data['previous_period']['total'], Decimal('0'))


class SubscriptionViewsTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u4')
        self.sub = Subscription.objects.create(
            merchant_key='NETFLIX.COM', display_name='NETFLIX.COM', category='SUBSCRIPTIONS',
            expected_amount=12.99, cadence='monthly', last_charged=date(2026, 3, 4),
        )

    def test_lists_non_dismissed_by_default(self):
        response = self.client.get('/api/enablebanking/subscriptions/')
        self.assertEqual(len(response.data), 1)

    def test_dismissing_hides_it_from_the_default_list(self):
        response = self.client.patch(
            f'/api/enablebanking/subscriptions/{self.sub.id}/', {'dismissed': True}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        response = self.client.get('/api/enablebanking/subscriptions/')
        self.assertEqual(len(response.data), 0)

    def test_include_dismissed_shows_it_again(self):
        self.sub.dismissed = True
        self.sub.save()
        response = self.client.get('/api/enablebanking/subscriptions/?include_dismissed=true')
        self.assertEqual(len(response.data), 1)


class SpendingTrendViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u5')
        account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        BankTransaction.objects.create(
            bank='kbc', bank_account=account, external_id='t1', amount=-40,
            currency='EUR', booking_date=date(2026, 1, 5), category='GROCERIES',
        )

    def test_returns_monthly_totals(self):
        response = self.client.get('/api/enablebanking/spending/trend/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['month'], '2026-01')

    def test_respects_months_query_param(self):
        response = self.client.get('/api/enablebanking/spending/trend/?months=1')
        self.assertEqual(len(response.data), 1)


class BudgetListViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u6')

    def test_lists_budgets(self):
        Budget.objects.create(category='GROCERIES', monthly_limit=Decimal('300'))

        response = self.client.get('/api/enablebanking/budgets/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['category'], 'GROCERIES')

    def test_put_creates_a_budget(self):
        response = self.client.put(
            '/api/enablebanking/budgets/', {'category': 'DINING', 'monthly_limit': '150'}, format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Budget.objects.get(category='DINING').monthly_limit, Decimal('150'))

    def test_put_updates_an_existing_budget_rather_than_duplicating(self):
        Budget.objects.create(category='DINING', monthly_limit=Decimal('100'))

        self.client.put('/api/enablebanking/budgets/', {'category': 'DINING', 'monthly_limit': '200'}, format='json')

        self.assertEqual(Budget.objects.filter(category='DINING').count(), 1)
        self.assertEqual(Budget.objects.get(category='DINING').monthly_limit, Decimal('200'))

    def test_rejects_a_non_budgetable_category(self):
        response = self.client.put(
            '/api/enablebanking/budgets/', {'category': 'TRANSFER', 'monthly_limit': '100'}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Budget.objects.count(), 0)

    def test_rejects_a_zero_limit(self):
        response = self.client.put(
            '/api/enablebanking/budgets/', {'category': 'GROCERIES', 'monthly_limit': '0'}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Budget.objects.count(), 0)

    def test_rejects_a_negative_limit(self):
        response = self.client.put(
            '/api/enablebanking/budgets/', {'category': 'GROCERIES', 'monthly_limit': '-10'}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Budget.objects.count(), 0)

    def test_rejects_a_non_numeric_limit(self):
        response = self.client.put(
            '/api/enablebanking/budgets/', {'category': 'GROCERIES', 'monthly_limit': 'abc'}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Budget.objects.count(), 0)


class BudgetProgressViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u7')

    def test_returns_progress_rows(self):
        account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        Budget.objects.create(category='GROCERIES', monthly_limit=Decimal('100'))
        BankTransaction.objects.create(
            bank='kbc', bank_account=account, external_id='t1', amount=Decimal('-40'),
            currency='EUR', booking_date=date.today(), category='GROCERIES',
        )

        response = self.client.get('/api/enablebanking/budgets/progress/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['category'], 'GROCERIES')
        self.assertEqual(Decimal(str(response.data[0]['spent'])), Decimal('40'))
