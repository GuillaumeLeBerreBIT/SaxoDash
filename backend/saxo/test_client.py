from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlparse
from django.test import TestCase, override_settings
from backend import settings
from . import client


class SaxoClientTest(TestCase):
    def test_build_authorize_url_includes_client_id_and_state(self):
        url = client.build_authorize_url('xyz-state')
        self.assertIn('sim.logonvalidation.net/authorize', url)
        self.assertIn('state=xyz-state', url)
        self.assertIn(f'client_id={settings.SAXO_KEY}', url) if settings.SAXO_KEY else None

    @override_settings(
        SAXO_KEY='key/with+chars',
        SAXO_REDIRECT_URI='http://localhost:8000/api/saxo/callback/',
    )
    def test_build_authorize_url_percent_encodes_params(self):
        url = client.build_authorize_url('a b&c')
        query = parse_qs(urlparse(url).query)

        self.assertNotIn('redirect_uri=http://', url)
        self.assertEqual(query['redirect_uri'], ['http://localhost:8000/api/saxo/callback/'])
        self.assertEqual(query['client_id'], ['key/with+chars'])
        self.assertEqual(query['state'], ['a b&c'])

    @patch('saxo.client.requests.post')
    def test_exchange_code_for_token_returns_json_on_success(self, mock_post):
        mock_post.return_value = Mock(ok=True, json=lambda: {'access_token': 'a', 'refresh_token': 'r', 'expires_in': 1200})
        result = client.exchange_code_for_token('some-code')
        self.assertEqual(result['access_token'], 'a')

    @patch('saxo.client.requests.post')
    def test_exchange_code_for_token_raises_on_failure(self, mock_post):
        mock_post.return_value = Mock(ok=False, status_code=400, text='bad request')
        with self.assertRaises(client.SaxoAuthError):
            client.exchange_code_for_token('bad-code')

    @patch('saxo.client.requests.post')
    def test_refresh_access_token_raises_on_failure(self, mock_post):
        mock_post.return_value = Mock(ok=False, status_code=401, text='expired')
        with self.assertRaises(client.SaxoAuthError):
            client.refresh_access_token('stale-refresh-token')

    @patch('saxo.client.requests.get')
    def test_get_positions_returns_data_list(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': [{'PositionId': '1'}]})
        result = client.get_positions('token')
        self.assertEqual(result, [{'PositionId': '1'}])

    @patch('saxo.client.requests.get')
    def test_get_closed_positions_returns_data_list(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': [{'ClosedPositionUniqueId': 1}]})
        result = client.get_closed_positions('token')
        self.assertEqual(result, [{'ClosedPositionUniqueId': 1}])

    @patch('saxo.client.requests.get')
    def test_get_closed_positions_requests_display_fields(self, mock_get):
        # Without DisplayAndFormat, Saxo sends only the Uic - no instrument
        # name or ticker to show in the ledger.
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': []})
        client.get_closed_positions('token')
        self.assertIn('DisplayAndFormat', mock_get.call_args.kwargs['params']['FieldGroups'])

    @patch('saxo.client.requests.get')
    def test_get_propagates_api_errors_from_any_endpoint(self, mock_get):
        # Every endpoint function (get_positions, get_chart, get_infoprices...)
        # is a thin wrapper over _get - one contract test here replaces one
        # near-identical "raises on API error" test per wrapper.
        mock_get.return_value = Mock(ok=False, status_code=500, text='server error')
        with self.assertRaises(client.SaxoAPIError):
            client._get('token', '/some/path')


class SaxoMarketDataClientTest(TestCase):
    @patch('saxo.client.requests.get')
    def test_get_chart_returns_the_data_list(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': [{'Close': 1.0}]})

        result = client.get_chart('token', 211, 'Stock', 1440, count=66)

        self.assertEqual(result, [{'Close': 1.0}])
        params = mock_get.call_args.kwargs['params']
        self.assertEqual(params['Uic'], 211)
        self.assertEqual(params['AssetType'], 'Stock')
        self.assertEqual(params['Horizon'], 1440)
        self.assertEqual(params['Count'], 66)

    @patch('saxo.client.requests.get')
    def test_get_chart_does_not_ask_for_a_mode_without_a_time(self, mock_get):
        # Mode picks a side of a given Time, so Saxo rejects it on its own:
        # 400 InvalidModelState, "Time is not provided." Sending neither
        # returns the most recent Count samples, which is what the chart wants.
        # Confirmed against SIM 2026-09-02.
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': []})

        client.get_chart('token', 211, 'Stock', 1440, count=66)

        params = mock_get.call_args.kwargs['params']
        self.assertNotIn('Mode', params)
        self.assertNotIn('Time', params)

    @patch('saxo.client.requests.get')
    def test_get_chart_clamps_count_to_saxos_ceiling(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': []})

        client.get_chart('token', 211, 'Stock', 1440, count=99_999)

        self.assertEqual(mock_get.call_args.kwargs['params']['Count'], client.CHART_MAX_COUNT)

    @patch('saxo.client.requests.get')
    def test_search_instruments_passes_keywords_and_asset_types(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': [{'Symbol': 'NVDA:xnas'}]})

        result = client.search_instruments('token', 'nvda')

        self.assertEqual(result, [{'Symbol': 'NVDA:xnas'}])
        params = mock_get.call_args.kwargs['params']
        self.assertEqual(params['Keywords'], 'nvda')
        self.assertEqual(params['AssetTypes'], 'Stock,Etf')

    @patch('saxo.client.requests.get')
    def test_get_instrument_details_puts_uic_and_type_in_the_path(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Uic': 211})

        client.get_instrument_details('token', 211, 'Stock')

        self.assertIn('/ref/v1/instruments/details/211/Stock', mock_get.call_args.args[0])

    @patch('saxo.client.requests.get')
    def test_get_infoprices_joins_the_uics_into_one_request(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': [{'Uic': 211}]})

        result = client.get_infoprices('token', [211, 212], 'Stock')

        self.assertEqual(result, [{'Uic': 211}])
        self.assertEqual(mock_get.call_args.kwargs['params']['Uics'], '211,212')
