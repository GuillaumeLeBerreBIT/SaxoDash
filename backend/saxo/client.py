from urllib.parse import urlencode

import requests
from django.conf import settings

# Keyed by SAXO_ENVIRONMENT so going live is a config change, not an edit here.
ENVIRONMENTS = {
    'sim': {
        'auth': 'https://sim.logonvalidation.net',
        'api': 'https://gateway.saxobank.com/sim/openapi',
    },
    'live': {
        'auth': 'https://live.logonvalidation.net',
        'api': 'https://gateway.saxobank.com/openapi',
    },
}

REQUEST_TIMEOUT = 10

# Saxo error bodies can be long; enough to diagnose, not enough to flood a log.
ERROR_BODY_LIMIT = 200

# Saxo rejects a chart request asking for more samples than this.
CHART_MAX_COUNT = 1200

INFOPRICE_FIELD_GROUPS = 'Quote,PriceInfo,PriceInfoDetails,InstrumentPriceDetails'


class SaxoAuthError(Exception):
    """Raised when the OAuth token exchange or refresh fails."""


class SaxoAPIError(Exception):
    """Raised when a Saxo OpenAPI request fails."""


def _base_urls():
    return ENVIRONMENTS[settings.SAXO_ENVIRONMENT]


def _auth_base_url():
    return _base_urls()['auth']


def _api_base_url():
    return _base_urls()['api']


def _request(send, url, error_class, label, **kwargs):
    try:
        response = send(url, timeout=REQUEST_TIMEOUT, **kwargs)
    except requests.RequestException as exc:
        raise error_class(f'{label} failed: {exc}') from exc

    if not response.ok:
        body = response.text[:ERROR_BODY_LIMIT]
        raise error_class(f'{label} failed: {response.status_code} {body}')

    try:
        return response.json()
    except ValueError as exc:
        raise error_class(f'{label} returned a non-JSON body') from exc


def _token_request(grant, label):
    return _request(
        requests.post,
        f'{_auth_base_url()}/token',
        SaxoAuthError,
        label,
        data={
            **grant,
            'redirect_uri': settings.SAXO_REDIRECT_URI,
            'client_id': settings.SAXO_KEY,
            'client_secret': settings.SAXO_SECRET,
        },
    )


def _get(access_token, path, params=None):
    return _request(
        requests.get,
        f'{_api_base_url()}{path}',
        SaxoAPIError,
        f'GET {path}',
        headers={'Authorization': f'Bearer {access_token}'},
        params=params,
    )


def build_authorize_url(state):
    query = urlencode({
        'response_type': 'code',
        'client_id': settings.SAXO_KEY,
        'redirect_uri': settings.SAXO_REDIRECT_URI,
        'state': state,
    })
    return f'{_auth_base_url()}/authorize?{query}'


def exchange_code_for_token(code):
    return _token_request(
        {'grant_type': 'authorization_code', 'code': code},
        'Token exchange',
    )


def refresh_access_token(refresh_token):
    return _token_request(
        {'grant_type': 'refresh_token', 'refresh_token': refresh_token},
        'Token refresh',
    )


def get_positions(access_token):
    params = {'FieldGroups': 'DisplayAndFormat,PositionBase,PositionView'}
    return _get(access_token, '/port/v1/positions/me', params=params).get('Data', [])


def get_account_balance(access_token):
    return _get(access_token, '/port/v1/balances/me')


def get_closed_positions(access_token):
    return _get(access_token, '/port/v1/closedpositions/me')


# Market data. Uic alone is ambiguous - every one of these needs the matching
# AssetType or Saxo answers 404.

def get_chart(access_token, uic, asset_type, horizon, count=CHART_MAX_COUNT, mode='UpTo'):
    params = {
        'Uic': uic,
        'AssetType': asset_type,
        'Horizon': horizon,
        'Count': min(int(count), CHART_MAX_COUNT),
        'Mode': mode,
    }
    return _get(access_token, '/chart/v3/charts', params=params).get('Data', [])


def search_instruments(access_token, keywords, asset_types='Stock,Etf'):
    params = {'Keywords': keywords, 'AssetTypes': asset_types, '$top': 25}
    return _get(access_token, '/ref/v1/instruments', params=params).get('Data', [])


def get_instrument_details(access_token, uic, asset_type):
    return _get(access_token, f'/ref/v1/instruments/details/{uic}/{asset_type}')


def get_infoprices(access_token, uics, asset_type, field_groups=INFOPRICE_FIELD_GROUPS):
    params = {
        'Uics': ','.join(str(u) for u in uics),
        'AssetType': asset_type,
        'FieldGroups': field_groups,
    }
    return _get(access_token, '/trade/v1/infoprices/list', params=params).get('Data', [])
