from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import TextAnnotation

LIST_URL = '/api/research/text-annotations/211/Stock/'


def detail_url(pk):
    return f'/api/research/text-annotations/{pk}/'


class TextAnnotationAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def annotation(self, uic=211, asset_type='Stock', bar_date='2026-08-01', price='100.00', text='Earnings gap'):
        return TextAnnotation.objects.create(uic=uic, asset_type=asset_type, bar_date=bar_date, price=Decimal(price), text=text)

    def test_requires_authentication(self):
        self.client.credentials()

        self.assertEqual(self.client.get(LIST_URL).status_code, 401)

    def test_lists_only_the_annotations_of_that_instrument(self):
        self.annotation()
        self.annotation(asset_type='CfdOnStock')
        self.annotation(uic=999)

        response = self.client.get(LIST_URL)

        self.assertEqual(len(response.data), 1)

    def test_create_takes_the_instrument_from_the_url(self):
        response = self.client.post(
            LIST_URL,
            {'bar_date': '2026-08-01', 'price': '100.00', 'text': 'Gap up', 'uic': 5, 'asset_type': 'Etf'},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        annotation = TextAnnotation.objects.get()
        self.assertEqual((annotation.uic, annotation.asset_type), (211, 'Stock'))

    def test_rejects_blank_text(self):
        response = self.client.post(LIST_URL, {'bar_date': '2026-08-01', 'price': '100.00', 'text': ''}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(TextAnnotation.objects.exists())

    def test_rejects_a_price_at_or_below_zero(self):
        response = self.client.post(LIST_URL, {'bar_date': '2026-08-01', 'price': '0', 'text': 'x'}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_patch_moves_the_annotation(self):
        annotation = self.annotation()

        response = self.client.patch(detail_url(annotation.pk), {'bar_date': '2026-08-05', 'price': '95.00'}, format='json')

        self.assertEqual(response.status_code, 200)
        annotation.refresh_from_db()
        self.assertEqual(str(annotation.bar_date), '2026-08-05')
        self.assertEqual(annotation.price, Decimal('95.00'))

    def test_patch_changes_the_text(self):
        annotation = self.annotation()

        response = self.client.patch(detail_url(annotation.pk), {'text': 'Revised'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['text'], 'Revised')

    def test_delete_removes_the_annotation(self):
        annotation = self.annotation()

        response = self.client.delete(detail_url(annotation.pk))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(TextAnnotation.objects.filter(pk=annotation.pk).exists())

    def test_a_single_annotation_cannot_be_read_on_its_own(self):
        annotation = self.annotation()

        self.assertEqual(self.client.get(detail_url(annotation.pk)).status_code, 405)
