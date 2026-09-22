from decimal import Decimal
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import SymbolNote


class SymbolNoteAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.get('/api/research/notes/AAPL/')
        self.assertEqual(response.status_code, 401)

    def test_get_creates_an_empty_note_on_first_access(self):
        response = self.client.get('/api/research/notes/AAPL/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['symbol'], 'AAPL')
        self.assertEqual(response.data['business_summary'], '')
        self.assertIsNone(response.data['target_price'])
        self.assertEqual(SymbolNote.objects.count(), 1)

    def test_a_second_get_does_not_duplicate_the_row(self):
        self.client.get('/api/research/notes/AAPL/')
        self.client.get('/api/research/notes/AAPL/')

        self.assertEqual(SymbolNote.objects.filter(symbol='AAPL').count(), 1)

    def test_patch_updates_the_note(self):
        response = self.client.patch(
            '/api/research/notes/AAPL/',
            {'business_summary': 'Makes phones.', 'bull_case': 'Services growth.', 'target_price': '250.00'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['business_summary'], 'Makes phones.')
        note = SymbolNote.objects.get(symbol='AAPL')
        self.assertEqual(note.bull_case, 'Services growth.')
        self.assertEqual(note.target_price, Decimal('250.00'))

    def test_patch_cannot_change_the_symbol(self):
        self.client.get('/api/research/notes/AAPL/')

        response = self.client.patch('/api/research/notes/AAPL/', {'symbol': 'MSFT'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['symbol'], 'AAPL')
        self.assertFalse(SymbolNote.objects.filter(symbol='MSFT').exists())

    def test_uppercases_the_symbol_from_the_url(self):
        response = self.client.get('/api/research/notes/aapl/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['symbol'], 'AAPL')

    def test_rejects_a_malformed_symbol(self):
        response = self.client.get('/api/research/notes/AAPL%20US/')
        self.assertEqual(response.status_code, 400)
