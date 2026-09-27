from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import PriceLine

LIST_URL = '/api/research/price-lines/211/Stock/'


def detail_url(pk):
    return f'/api/research/price-lines/{pk}/'


class PriceLineAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def line(self, uic=211, asset_type='Stock', price='100.00'):
        return PriceLine.objects.create(uic=uic, asset_type=asset_type, price=Decimal(price))

    def test_requires_authentication(self):
        self.client.credentials()

        self.assertEqual(self.client.get(LIST_URL).status_code, 401)
        self.assertEqual(self.client.post(LIST_URL, {'price': '1.00'}, format='json').status_code, 401)

    def test_lists_only_the_lines_of_that_instrument(self):
        self.line(price='100.00')
        self.line(asset_type='CfdOnStock', price='101.00')
        self.line(uic=999, price='102.00')

        response = self.client.get(LIST_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([line['price'] for line in response.data], ['100.00'])

    def test_lists_oldest_first(self):
        first = self.line(price='120.00')
        second = self.line(price='90.00')

        response = self.client.get(LIST_URL)

        self.assertEqual([line['id'] for line in response.data], [first.pk, second.pk])

    def test_create_takes_the_instrument_from_the_url(self):
        response = self.client.post(
            LIST_URL, {'price': '123.45', 'uic': 5, 'asset_type': 'Etf'}, format='json'
        )

        self.assertEqual(response.status_code, 201)
        line = PriceLine.objects.get()
        self.assertEqual((line.uic, line.asset_type, line.price), (211, 'Stock', Decimal('123.45')))

    def test_rejects_a_price_at_or_below_zero(self):
        for value in ('0', '-1.00'):
            with self.subTest(value=value):
                response = self.client.post(LIST_URL, {'price': value}, format='json')

                self.assertEqual(response.status_code, 400)
                self.assertIn('price', response.data)
        self.assertFalse(PriceLine.objects.exists())

    def test_patch_moves_the_line_and_nothing_else(self):
        line = self.line()

        response = self.client.patch(
            detail_url(line.pk), {'price': '110.00', 'uic': 5, 'asset_type': 'Etf'}, format='json'
        )

        self.assertEqual(response.status_code, 200)
        line.refresh_from_db()
        self.assertEqual((line.uic, line.asset_type, line.price), (211, 'Stock', Decimal('110.00')))

    def test_patch_rejects_a_price_at_or_below_zero(self):
        line = self.line()

        response = self.client.patch(detail_url(line.pk), {'price': '0'}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_patch_on_a_missing_line_is_404(self):
        response = self.client.patch(detail_url(4040), {'price': '1.00'}, format='json')

        self.assertEqual(response.status_code, 404)

    def test_delete_removes_the_line(self):
        line = self.line()

        response = self.client.delete(detail_url(line.pk))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(PriceLine.objects.filter(pk=line.pk).exists())

    def test_a_single_line_cannot_be_read_on_its_own(self):
        line = self.line()

        self.assertEqual(self.client.get(detail_url(line.pk)).status_code, 405)
