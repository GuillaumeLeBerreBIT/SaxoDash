import requests
from django.conf import settings

AUTH_BASE_URL = 'https://sim.logonvalidation.net'
API_BASE_URL = 'https://gateway.saxobank.com/sim/openapi'

class SaxoAuthError(Exception):
    """Raised when the OAuth token exchange or refresh fails."""


class SaxoAPIError(Exception):
    """Raised when a Saxo OpenAPI request fails."""


def build_authorize_url(state):
    params = {
        'response_type': 'code',
        'client_id': settings.SAXO_KEY,
        'redirect_uri': settings.SAXO_REDIRECT_URI,
        'state': state,
    }
    query = '&'.join(f'{k}={v}' for k, v in params.items())
    return f'{AUTH_BASE_URL}/authorize?{query}'


def exchange_code_for_token(code):
    response = requests.post(
        f'{AUTH_BASE_URL}/token',
        data={
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': settings.SAXO_REDIRECT_URI,
            'client_id': settings.SAXO_KEY,
            'client_secret': settings.SAXO_SECRET,
        },
        timeout=10,
    )
    if not response.ok:
        raise SaxoAuthError(f'Token exchange failed: {response.status_code} {response.text}')
    return response.json()


def refresh_access_token(refresh_token):
    response = requests.post(
        f'{AUTH_BASE_URL}/token',
        data={
            'grant_type': 'refresh_token',
            'refresh_token': refresh_token,
            'redirect_uri': settings.SAXO_REDIRECT_URI,
            'client_id': settings.SAXO_KEY,
            'client_secret': settings.SAXO_SECRET,
        },
        timeout=10,
    )
    if not response.ok:
        raise SaxoAuthError(f'Token refresh failed: {response.status_code} {response.text}')
    return response.json()


def _get(access_token, path, params=None):
    response = requests.get(
        f'{API_BASE_URL}{path}',
        headers={'Authorization': f'Bearer {access_token}'},
        params=params,
        timeout=10,
    )
    if not response.ok:
        raise SaxoAPIError(f'GET {path} failed: {response.status_code} {response.text}')
    return response.json()


def get_positions(access_token):
    params = {'FieldGroups': 'DisplayAndFormat,PositionBase,PositionView'}
    return _get(access_token, '/port/v1/positions/me', params=params).get('Data', [])


def get_account_balance(access_token):
    return _get(access_token, '/port/v1/balances/me')


def get_closed_positions(access_token):
    return _get(access_token, '/port/v1/closedpositions/me')

def get_client_key(access_token):
    return _get(access_token=access_token, path='/port/v1/clients/me')['ClientKey']

def get_transactions(access_token, from_date, to_date):
    params = {
        'ClientKey': get_client_key(access_token),
        'FromDate':from_date,
        'ToDate': to_date
    }
    
    return _get(access_token, '/hist/v1/transactions', params=params).get('Data', [])