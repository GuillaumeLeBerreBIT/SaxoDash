from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import TrendLine

LIST_URL = '/api/research/trend-lines/211/Stock/'


def detail_url(pk):
    return f'/api/research/trend-lines/{pk}/'


class TrendLineAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def line(self, uic=211, asset_type='Stock', start_bar_date='2026-08-01', start_price='100.00',
              end_bar_date='2026-08-10', end_price='110.00', label=''):
        return TrendLine.objects.create(
            uic=uic, asset_type=asset_type,
            start_bar_date=start_bar_date, start_price=Decimal(start_price),
            end_bar_date=end_bar_date, end_price=Decimal(end_price), label=label,
        )

    def test_requires_authentication(self):
        self.client.credentials()

        self.assertEqual(self.client.get(LIST_URL).status_code, 401)

    def test_lists_only_the_lines_of_that_instrument(self):
        self.line()
        self.line(asset_type='CfdOnStock')
        self.line(uic=999)

        response = self.client.get(LIST_URL)

        self.assertEqual(len(response.data), 1)

    def test_create_takes_the_instrument_from_the_url(self):
        response = self.client.post(
            LIST_URL,
            {
                'start_bar_date': '2026-08-01', 'start_price': '100.00',
                'end_bar_date': '2026-08-10', 'end_price': '110.00',
                'uic': 5, 'asset_type': 'Etf',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        line = TrendLine.objects.get()
        self.assertEqual((line.uic, line.asset_type), (211, 'Stock'))
        self.assertEqual(response.data['label'], '')

    def test_rejects_the_same_bar_for_both_ends(self):
        response = self.client.post(
            LIST_URL,
            {
                'start_bar_date': '2026-08-01', 'start_price': '100.00',
                'end_bar_date': '2026-08-01', 'end_price': '110.00',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(TrendLine.objects.exists())

    def test_rejects_a_price_at_or_below_zero(self):
        for field in ('start_price', 'end_price'):
            with self.subTest(field=field):
                payload = {
                    'start_bar_date': '2026-08-01', 'start_price': '100.00',
                    'end_bar_date': '2026-08-10', 'end_price': '110.00',
                    field: '0',
                }
                response = self.client.post(LIST_URL, payload, format='json')

                self.assertEqual(response.status_code, 400)
        self.assertFalse(TrendLine.objects.exists())

    def test_patch_moves_one_endpoint_and_leaves_the_other(self):
        line = self.line()

        response = self.client.patch(
            detail_url(line.pk), {'end_bar_date': '2026-08-12', 'end_price': '115.00'}, format='json'
        )

        self.assertEqual(response.status_code, 200)
        line.refresh_from_db()
        self.assertEqual(str(line.start_bar_date), '2026-08-01')
        self.assertEqual(str(line.end_bar_date), '2026-08-12')
        self.assertEqual(line.end_price, Decimal('115.00'))

    def test_patch_rejects_moving_both_ends_onto_the_same_bar(self):
        line = self.line()

        response = self.client.patch(detail_url(line.pk), {'end_bar_date': '2026-08-01'}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_patch_sets_the_label(self):
        line = self.line()

        response = self.client.patch(detail_url(line.pk), {'label': 'Breakout'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['label'], 'Breakout')

    def test_delete_removes_the_line(self):
        line = self.line()

        response = self.client.delete(detail_url(line.pk))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(TrendLine.objects.filter(pk=line.pk).exists())

    def test_patch_on_a_missing_line_is_404(self):
        response = self.client.patch(detail_url(4040), {'label': 'x'}, format='json')

        self.assertEqual(response.status_code, 404)

    def test_a_single_line_cannot_be_read_on_its_own(self):
        line = self.line()

        self.assertEqual(self.client.get(detail_url(line.pk)).status_code, 405)
