from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken


class TokenLogoutTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')

    def _refresh_token(self):
        return str(RefreshToken.for_user(self.user))

    def test_logout_blacklists_the_refresh_token(self):
        refresh = self._refresh_token()

        response = self.client.post('/api/token/logout/', {'refresh': refresh}, format='json')
        self.assertEqual(response.status_code, 205)

        reused = self.client.post('/api/token/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(reused.status_code, 401)

    def test_refresh_works_before_logout(self):
        refresh = self._refresh_token()

        response = self.client.post('/api/token/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)

    def test_rotation_invalidates_the_previous_refresh_token(self):
        refresh = self._refresh_token()

        rotated = self.client.post('/api/token/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(rotated.status_code, 200)

        # BLACKLIST_AFTER_ROTATION: the token just exchanged must not work again.
        replayed = self.client.post('/api/token/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(replayed.status_code, 401)

    def test_logout_requires_a_refresh_token(self):
        response = self.client.post('/api/token/logout/', {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_logout_is_idempotent_for_an_unusable_token(self):
        refresh = self._refresh_token()
        self.client.post('/api/token/logout/', {'refresh': refresh}, format='json')

        again = self.client.post('/api/token/logout/', {'refresh': refresh}, format='json')
        self.assertEqual(again.status_code, 205)

        garbage = self.client.post('/api/token/logout/', {'refresh': 'not-a-token'}, format='json')
        self.assertEqual(garbage.status_code, 205)

    def test_logout_does_not_require_a_valid_access_token(self):
        refresh = self._refresh_token()

        self.client.credentials(HTTP_AUTHORIZATION='Bearer expired-nonsense')
        response = self.client.post('/api/token/logout/', {'refresh': refresh}, format='json')

        self.assertEqual(response.status_code, 205)
