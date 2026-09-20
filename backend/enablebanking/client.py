import datetime
import time

import jwt as pyjwt
import requests
from django.conf import settings

API_BASE_URL = 'https://api.enablebanking.com'
REQUEST_TIMEOUT = 10
ERROR_BODY_LIMIT = 200

# Verified live against GET /aspsps?country=BE (2026-09-17, Task 10 Step 2).
# The listing also has a separate "KBC Brussels" entity, distinct from plain
# "KBC" - if the connect flow can't find the account under "KBC", that's the
# other candidate to try.
ASPSPS = {
    'kbc': {'name': 'KBC', 'country': 'BE'},
    'argenta': {'name': 'Argenta', 'country': 'BE'},
}


class EnableBankingAuthError(Exception):
    """Raised when JWT signing or authentication fails."""


class EnableBankingAPIError(Exception):
    """Raised when an Enable Banking API request fails."""


def _jwt():
    """A fresh RS256 JWT, signed per-request - Enable Banking has no OAuth2
    client-secret exchange; this JWT *is* the app-level authentication, valid
    for a short window rather than issued once and refreshed."""
    now = int(time.time())
    return pyjwt.encode(
        {'iss': 'enablebanking.com', 'aud': 'api.enablebanking.com', 'iat': now, 'exp': now + 300},
        settings.ENABLE_BANKING_PRIVATE_KEY,
        algorithm='RS256',
        headers={'kid': settings.ENABLE_BANKING_APPLICATION_ID},
    )


def _headers(extra=None):
    return {'Authorization': f'Bearer {_jwt()}', **(extra or {})}


def _raise_for_status(response, label):
    if not response.ok:
        body = response.text[:ERROR_BODY_LIMIT]
        raise EnableBankingAPIError(f'{label} failed: {response.status_code} {body}')


def _call(fn, *args, **kwargs):
    """Wraps a requests call so a network-level failure (timeout, DNS,
    connection reset) raises EnableBankingAPIError like an HTTP-status
    failure already does via _raise_for_status - callers (task retry logic,
    per-account skip-and-continue) only need to handle one exception type."""
    try:
        return fn(*args, **kwargs)
    except requests.exceptions.RequestException as exc:
        raise EnableBankingAPIError(f'Request failed: {exc}') from exc


def _valid_until_180_days():
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=180)).isoformat()


def build_authorize_url(bank, state, redirect_url, iban=None):
    access = {
        'valid_until': _valid_until_180_days(),
        'balances': True,
        'transactions': True,
    }
    if iban:
        access['accounts'] = [{'iban': iban}]

    body = {
        'access': access,
        'aspsp': ASPSPS[bank],
        'state': state,
        'redirect_url': redirect_url,
        'psu_type': 'personal',
    }
    response = _call(
        requests.post, f'{API_BASE_URL}/auth', json=body, headers=_headers(), timeout=REQUEST_TIMEOUT,
    )
    _raise_for_status(response, 'Start authorization')
    return response.json()['url']


def exchange_code_for_session(code):
    response = _call(
        requests.post, f'{API_BASE_URL}/sessions', json={'code': code}, headers=_headers(), timeout=REQUEST_TIMEOUT,
    )
    _raise_for_status(response, 'Session authorization')
    return response.json()


def get_balances(session_id, account_uid):
    response = _call(
        requests.get,
        f'{API_BASE_URL}/accounts/{account_uid}/balances',
        headers=_headers({'X-Session-Id': session_id}),
        timeout=REQUEST_TIMEOUT,
    )
    _raise_for_status(response, 'Get balances')
    return response.json()


def get_transactions(session_id, account_uid, date_from=None, strategy=None, continuation_key=None):
    params = {}
    if date_from:
        params['date_from'] = date_from
    if strategy:
        params['strategy'] = strategy
    if continuation_key:
        params['continuation_key'] = continuation_key

    response = _call(
        requests.get,
        f'{API_BASE_URL}/accounts/{account_uid}/transactions',
        params=params,
        headers=_headers({'X-Session-Id': session_id}),
        timeout=REQUEST_TIMEOUT,
    )
    _raise_for_status(response, 'Get transactions')
    return response.json()


def iter_transactions(session_id, account_uid, date_from=None, strategy=None):
    """Yields every transaction for one account, following continuation_key
    until Enable Banking reports no more pages. date_from/strategy are only
    sent on the first request - continuation_key alone carries the rest."""
    continuation_key = None
    while True:
        if continuation_key:
            page = get_transactions(session_id, account_uid, continuation_key=continuation_key)
        else:
            page = get_transactions(session_id, account_uid, date_from=date_from, strategy=strategy)
        yield from page['transactions']
        continuation_key = page.get('continuation_key')
        if not continuation_key:
            break
