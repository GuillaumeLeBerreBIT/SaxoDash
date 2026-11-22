from decimal import Decimal

from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import ChartZone
from users.testing import the_owner

LIST_URL = '/api/research/zones/211/Stock/'


def detail_url(pk):
    return f'/api/research/zones/{pk}/'


class ChartZoneAPITest(APITestCase):
    def setUp(self):
        self.user = the_owner()
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def zone(self, uic=211, asset_type='Stock', start_bar_date='2026-08-01', end_bar_date='2026-08-10',
             low_price='168.00', high_price='175.00', label=''):
        return ChartZone.objects.create(
            user=the_owner(),
            uic=uic, asset_type=asset_type,
            start_bar_date=start_bar_date, end_bar_date=end_bar_date,
            low_price=Decimal(low_price), high_price=Decimal(high_price), label=label,
        )

    def payload(self, **overrides):
        body = {
            'start_bar_date': '2026-08-01', 'end_bar_date': '2026-08-10',
            'low_price': '168.00', 'high_price': '175.00',
        }
        body.update(overrides)
        return body

    def test_requires_authentication(self):
        self.client.credentials()

        self.assertEqual(self.client.get(LIST_URL).status_code, 401)

    def test_lists_only_the_zones_of_that_instrument(self):
        self.zone()
        self.zone(asset_type='CfdOnStock')
        self.zone(uic=999)

        response = self.client.get(LIST_URL)

        self.assertEqual(len(response.data), 1)

    def test_create_takes_the_instrument_from_the_url(self):
        response = self.client.post(LIST_URL, self.payload(uic=5, asset_type='Etf'), format='json')

        self.assertEqual(response.status_code, 201)
        zone = ChartZone.objects.get()
        self.assertEqual((zone.uic, zone.asset_type), (211, 'Stock'))
        self.assertEqual(response.data['label'], '')

    def test_a_zone_may_sit_on_a_single_day(self):
        response = self.client.post(LIST_URL, self.payload(end_bar_date='2026-08-01'), format='json')

        self.assertEqual(response.status_code, 201)

    def test_rejects_an_end_before_the_start(self):
        response = self.client.post(LIST_URL, self.payload(end_bar_date='2026-07-30'), format='json')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(ChartZone.objects.exists())

    def test_rejects_a_high_that_is_not_above_the_low(self):
        for high in ('168.00', '160.00'):
            with self.subTest(high=high):
                response = self.client.post(LIST_URL, self.payload(high_price=high), format='json')

                self.assertEqual(response.status_code, 400)
        self.assertFalse(ChartZone.objects.exists())

    def test_rejects_a_price_at_or_below_zero(self):
        for field in ('low_price', 'high_price'):
            with self.subTest(field=field):
                response = self.client.post(LIST_URL, self.payload(**{field: '0'}), format='json')

                self.assertEqual(response.status_code, 400)
        self.assertFalse(ChartZone.objects.exists())

    def test_patch_moves_one_bound_and_leaves_the_other(self):
        zone = self.zone()

        response = self.client.patch(detail_url(zone.pk), {'high_price': '180.00'}, format='json')

        self.assertEqual(response.status_code, 200)
        zone.refresh_from_db()
        self.assertEqual(zone.high_price, Decimal('180.00'))
        self.assertEqual(zone.low_price, Decimal('168.00'))

    def test_patch_rejects_a_high_pushed_below_the_stored_low(self):
        zone = self.zone()

        response = self.client.patch(detail_url(zone.pk), {'high_price': '160.00'}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_patch_sets_the_label(self):
        zone = self.zone()

        response = self.client.patch(detail_url(zone.pk), {'label': 'Support'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['label'], 'Support')

    def test_delete_removes_the_zone(self):
        zone = self.zone()

        response = self.client.delete(detail_url(zone.pk))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(ChartZone.objects.filter(pk=zone.pk).exists())

    def test_patch_on_a_missing_zone_is_404(self):
        response = self.client.patch(detail_url(4040), {'label': 'x'}, format='json')

        self.assertEqual(response.status_code, 404)

    def test_a_single_zone_cannot_be_read_on_its_own(self):
        zone = self.zone()

        self.assertEqual(self.client.get(detail_url(zone.pk)).status_code, 405)
