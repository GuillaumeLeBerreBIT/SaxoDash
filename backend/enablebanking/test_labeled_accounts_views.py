from datetime import date

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import BankAccount

from .models import BankTransaction, ManualIbanLabel


def _auth_client(test_case, username):
    user = User.objects.create_user(username=username, password='p')
    token = RefreshToken.for_user(user).access_token
    test_case.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


class LabeledAccountListCreateViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u1')
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.get('/api/enablebanking/labeled-accounts/')
        self.assertEqual(response.status_code, 401)

    def test_lists_existing_labels(self):
        ManualIbanLabel.objects.create(iban='BE99000000000000', label='Household', category='TRANSFER')
        response = self.client.get('/api/enablebanking/labeled-accounts/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['label'], 'Household')

    def test_creates_a_label_by_iban(self):
        response = self.client.post('/api/enablebanking/labeled-accounts/', {
            'iban': 'BE99000000000000', 'label': 'Household', 'category': 'TRANSFER',
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ManualIbanLabel.objects.count(), 1)

    def test_creates_a_label_by_counterparty_name_with_no_iban(self):
        response = self.client.post('/api/enablebanking/labeled-accounts/', {
            'counterparty_name': 'Guillaume Le Berre', 'label': 'My other account', 'category': 'TRANSFER',
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ManualIbanLabel.objects.get().counterparty_name, 'GUILLAUME LE BERRE')

    def test_rejects_a_label_with_neither_iban_nor_name(self):
        response = self.client.post('/api/enablebanking/labeled-accounts/', {
            'label': 'Nothing to match on', 'category': 'TRANSFER',
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ManualIbanLabel.objects.count(), 0)
        # {'detail': ...}, not DRF's default non_field_errors shape - the
        # frontend's ApiError only ever reads body.detail.
        self.assertIn('detail', response.data)

    def test_creating_a_label_recategorizes_matching_rows_immediately(self):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='t1', amount=300,
            currency='EUR', booking_date=date(2026, 1, 5), category='REFUND_CREDIT',
            counterparty_name='GUILLAUME LE BERRE',
        )

        self.client.post('/api/enablebanking/labeled-accounts/', {
            'counterparty_name': 'Guillaume Le Berre', 'label': 'My other account', 'category': 'TRANSFER',
        })

        tx = BankTransaction.objects.get(external_id='t1')
        self.assertEqual(tx.category, 'TRANSFER')

    def test_creating_a_label_never_touches_a_manually_overridden_row(self):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='t2', amount=300,
            currency='EUR', booking_date=date(2026, 1, 5), category='REFUND_CREDIT',
            category_override='SHOPPING', counterparty_name='GUILLAUME LE BERRE',
        )

        self.client.post('/api/enablebanking/labeled-accounts/', {
            'counterparty_name': 'Guillaume Le Berre', 'label': 'My other account', 'category': 'TRANSFER',
        })

        tx = BankTransaction.objects.get(external_id='t2')
        self.assertEqual(tx.effective_category, 'SHOPPING')


class LabeledAccountDetailViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u1')
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        self.label = ManualIbanLabel.objects.create(iban='BE99000000000000', label='Household', category='TRANSFER')

    def test_updates_a_label_and_recategorizes(self):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='t3', amount=-50,
            currency='EUR', booking_date=date(2026, 1, 5), category='OTHER',
            counterparty_iban='BE99000000000000',
        )

        response = self.client.patch(
            f'/api/enablebanking/labeled-accounts/{self.label.pk}/', {'category': 'SAVINGS'},
        )

        self.assertEqual(response.status_code, 200)
        tx = BankTransaction.objects.get(external_id='t3')
        self.assertEqual(tx.category, 'SAVINGS')

    def test_deletes_a_label(self):
        response = self.client.delete(f'/api/enablebanking/labeled-accounts/{self.label.pk}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(ManualIbanLabel.objects.count(), 0)


class LabeledAccountCandidatesViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u1')
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def _tx(self, name, amount, external_id, iban=None, category='OTHER'):
        return BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id=external_id,
            amount=amount, currency='EUR', booking_date=date(2026, 1, 5),
            counterparty_name=name, counterparty_iban=iban, category=category,
        )

    def test_suggests_a_recurring_unlabeled_counterparty(self):
        self._tx('HANNE MISSIAEN', -100, 'c1', iban='BE01', category='OTHER')
        self._tx('HANNE MISSIAEN', -50, 'c2', iban='BE01', category='OTHER')

        response = self.client.get('/api/enablebanking/labeled-accounts/candidates/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['counterparty_name'], 'HANNE MISSIAEN')
        self.assertEqual(response.data[0]['count'], 2)

    def test_a_single_occurrence_is_not_a_candidate(self):
        self._tx('ONE OFF SHOP', -20, 'c3', category='OTHER')

        response = self.client.get('/api/enablebanking/labeled-accounts/candidates/')

        self.assertEqual(response.data, [])

    def test_a_normally_categorized_merchant_is_not_a_candidate(self):
        self._tx('COLRUYT ANTWERPEN', -20, 'c4', category='GROCERIES')
        self._tx('COLRUYT ANTWERPEN', -25, 'c5', category='GROCERIES')

        response = self.client.get('/api/enablebanking/labeled-accounts/candidates/')

        self.assertEqual(response.data, [])

    def test_an_already_labeled_counterparty_is_not_suggested_again(self):
        ManualIbanLabel.objects.create(iban='BE01', label='Already labeled', category='TRANSFER')
        self._tx('HANNE MISSIAEN', -100, 'c6', iban='BE01', category='TRANSFER')
        self._tx('HANNE MISSIAEN', -50, 'c7', iban='BE01', category='TRANSFER')

        response = self.client.get('/api/enablebanking/labeled-accounts/candidates/')

        self.assertEqual(response.data, [])

    def test_ranks_by_total_amount_descending(self):
        self._tx('SMALL RECURRING', -10, 'c8', category='OTHER')
        self._tx('SMALL RECURRING', -10, 'c9', category='OTHER')
        self._tx('BIG RECURRING', -500, 'c10', category='OTHER')
        self._tx('BIG RECURRING', -500, 'c11', category='OTHER')

        response = self.client.get('/api/enablebanking/labeled-accounts/candidates/')

        self.assertEqual(response.data[0]['counterparty_name'], 'BIG RECURRING')
        self.assertEqual(response.data[1]['counterparty_name'], 'SMALL RECURRING')
