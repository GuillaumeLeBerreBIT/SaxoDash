from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from research import finnhub

from .acting import acting_as, clear_acting_user, current_user
from .authentication import JWTAuthentication
from .testing import make_user, the_owner

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

BANKING_LISTS = [
    '/api/enablebanking/status/',
    '/api/enablebanking/transactions/',
    '/api/enablebanking/spending/summary/',
    '/api/enablebanking/spending/trend/',
    '/api/enablebanking/subscriptions/',
    '/api/enablebanking/budgets/',
    '/api/enablebanking/budgets/progress/',
    '/api/enablebanking/labeled-accounts/',
    '/api/enablebanking/labeled-accounts/candidates/',
]


def sign_in(client, user):
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


class BankingOwnerOnlyTest(APITestCase):
    def test_non_owner_is_refused_banking(self):
        the_owner()
        sign_in(self.client, make_user('stranger'))
        for url in BANKING_LISTS:
            self.assertEqual(self.client.get(url).status_code, 403, url)
        self.assertEqual(self.client.post('/api/enablebanking/connect-ticket/', {'bank': 'kbc'}).status_code, 403)
        self.assertEqual(self.client.post('/api/enablebanking/sync/').status_code, 403)

    def test_owner_may_read_banking(self):
        sign_in(self.client, the_owner())
        for url in BANKING_LISTS:
            self.assertEqual(self.client.get(url).status_code, 200, url)


class ActingUserTest(APITestCase):
    def test_authenticating_a_request_sets_the_acting_user(self):
        user = make_user('someone')
        token = RefreshToken.for_user(user).access_token
        request = APIRequestFactory().get('/', HTTP_AUTHORIZATION=f'Bearer {token}')
        JWTAuthentication().authenticate(request)
        self.assertEqual(current_user(), user)
        clear_acting_user()

    def test_an_anonymous_request_sets_no_acting_user(self):
        JWTAuthentication().authenticate(APIRequestFactory().get('/'))
        self.assertIsNone(current_user())

    def test_acting_user_reset_after_request(self):
        sign_in(self.client, make_user('someone'))
        self.assertEqual(self.client.get('/api/enablebanking/status/').status_code, 403)
        self.assertIsNone(current_user())

    def test_acting_user_reset_when_the_request_raises(self):
        sign_in(self.client, the_owner())
        with patch('enablebanking.views.credentials.connection_state', side_effect=RuntimeError):
            with self.assertRaises(RuntimeError):
                self.client.get('/api/enablebanking/status/')
        self.assertIsNone(current_user())


@override_settings(
    CACHES=LOCMEM, FINNHUB_API_KEY='test-key', FINNHUB_CALLS_PER_MINUTE=58,
    FINNHUB_BACKGROUND_RESERVE=15, FINNHUB_OWNER_RESERVE=20,
)
class OwnerReserveTest(TestCase):
    def setUp(self):
        cache.clear()
        requests_get = patch('research.finnhub.request_json', return_value={})
        requests_get.start()
        self.addCleanup(requests_get.stop)
        clock = patch('research.finnhub._now', return_value=6000.0)
        clock.start()
        self.addCleanup(clock.stop)

    def spend(self, count):
        for _ in range(count):
            finnhub._get('/stock/profile2', symbol='AAPL')

    def test_non_owner_hits_shared_cap_first(self):
        self.spend(58 - 20)
        with acting_as(make_user('stranger')):
            with self.assertRaises(finnhub.FinnhubBusy):
                finnhub._get('/stock/profile2', symbol='AAPL')
        with acting_as(the_owner()):
            finnhub._get('/stock/profile2', symbol='AAPL')

    def test_a_refused_non_owner_call_is_not_counted_as_spent(self):
        self.spend(58 - 20)
        with acting_as(make_user('stranger')):
            for _ in range(3):
                with self.assertRaises(finnhub.FinnhubBusy):
                    finnhub._get('/stock/profile2', symbol='AAPL')
        with acting_as(the_owner()):
            self.spend(20)

    def test_background_work_ignores_the_owner_reserve(self):
        self.spend(58 - 15)
        with acting_as(make_user('stranger')), finnhub.background_calls():
            with self.assertRaises(finnhub.FinnhubBusy):
                finnhub._get('/stock/profile2', symbol='AAPL')

    def test_background_work_without_a_user_has_the_full_background_share(self):
        self.spend(58 - 20)
        with finnhub.background_calls():
            finnhub._get('/stock/profile2', symbol='AAPL')

    @override_settings(FINNHUB_CALLS_PER_MINUTE=2, FINNHUB_BACKGROUND_RESERVE=1, FINNHUB_OWNER_RESERVE=50)
    def test_a_non_owner_always_keeps_one_call(self):
        with acting_as(make_user('stranger')):
            finnhub._get('/stock/profile2', symbol='AAPL')
