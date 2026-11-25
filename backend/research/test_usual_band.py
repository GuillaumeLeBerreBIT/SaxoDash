from datetime import date
from unittest.mock import patch

from django.core.cache import cache
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from users.testing import the_owner

from .listings import Listing
from .usual_band import price_band

BARS = [{'date': '2025-01-10', 'close': 10.0}, {'date': '2025-01-13', 'close': 11.0}]
EMPTY_SERIES = {'annual': {}, 'quarterly': {}, 'country': 'US'}


class ResolvedListing(Listing):
    def refusal(self, *, allow_fund=False):
        return None


class RefusedListing(Listing):
    def refusal(self, *, allow_fund=False):
        return 'Only US-listed companies have a P/E history.'


def _listing(cls):
    return cls(ticker='AAPL', symbol='AAPL', name='Apple', uic=1, asset_type='Stock', currency='USD', exchange='NASDAQ')


class UsualBandViewTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = the_owner()
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        self.assertEqual(self.client.get('/api/research/valuation/AAPL/').status_code, 401)

    @patch('research.usual_band.finnhub.valuation_series', return_value=EMPTY_SERIES)
    @patch('research.usual_band.daily.available', return_value=(BARS, None))
    @patch('research.usual_band.look_up', return_value=_listing(ResolvedListing))
    def test_returns_one_band_row_per_bar(self, mock_lookup, mock_bars, mock_series):
        response = self.client.get('/api/research/valuation/AAPL/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['band'], [['2025-01-10', None, None], ['2025-01-13', None, None]])
        self.assertEqual(response.data['warnings'], [])

    @patch('research.usual_band.finnhub.valuation_series')
    @patch('research.usual_band.daily.available')
    @patch('research.usual_band.look_up', return_value=_listing(RefusedListing))
    def test_a_refused_listing_gets_no_band_and_no_finnhub_call(self, mock_lookup, mock_bars, mock_series):
        response = self.client.get('/api/research/valuation/AAPL/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'band': [], 'warnings': ['Only US-listed companies have a P/E history.']})
        mock_series.assert_not_called()
        mock_bars.assert_not_called()


class PriceBandTest(APITestCase):
    def test_turns_each_pe_level_into_a_price_with_that_days_trailing_eps(self):
        eps = [(date(2024, 1, 1), 2.5), (date(2024, 4, 1), 2.5), (date(2024, 7, 1), 2.5), (date(2024, 10, 1), 2.5)]
        band = [['2025-06-01', 18.0, 25.0], ['2024-06-01', 18.0, 25.0], ['2025-06-02', None, None]]

        self.assertEqual(
            price_band(band, eps),
            [['2025-06-01', 180.0, 250.0], ['2024-06-01', None, None], ['2025-06-02', None, None]],
        )
