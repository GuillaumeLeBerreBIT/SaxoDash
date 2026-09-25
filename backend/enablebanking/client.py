import datetime
import time

import jwt as pyjwt
import requests
from django.conf import settings

from core.http_client import request_json

API_BASE_URL = 'https://api.enablebanking.com'

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


class EnableBankingTransientError(EnableBankingAPIError):
    """A network failure, timeout, rate limit, or Enable-Banking-side (5xx)
    error - worth an automatic retry."""


class EnableBankingPermanentError(EnableBankingAPIError):
    """A 4xx response - the request itself is wrong or the session needs
    re-authentication, so an immediate retry would not help."""


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


def _request(send, path, label, **kwargs):
    return request_json(
        send, f'{API_BASE_URL}{path}', label,
        transient=EnableBankingTransientError, permanent=EnableBankingPermanentError, **kwargs,
    )


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
    return _request(requests.post, '/auth', 'Start authorization', json=body, headers=_headers())['url']


def exchange_code_for_session(code):
    return _request(requests.post, '/sessions', 'Session authorization', json={'code': code}, headers=_headers())


def get_balances(session_id, account_uid):
    return _request(
        requests.get, f'/accounts/{account_uid}/balances', 'Get balances',
        headers=_headers({'X-Session-Id': session_id}),
    )


def get_transactions(session_id, account_uid, date_from=None, strategy=None, continuation_key=None):
    params = {}
    if date_from:
        params['date_from'] = date_from
    if strategy:
        params['strategy'] = strategy
    if continuation_key:
        params['continuation_key'] = continuation_key

    return _request(
        requests.get, f'/accounts/{account_uid}/transactions', 'Get transactions',
        params=params, headers=_headers({'X-Session-Id': session_id}),
    )


def iter_transactions(session_id, account_uid, date_from=None, strategy=None):
    """Yields every transaction for one account, following continuation_key
    until Enable Banking reports no more pages. The continuation token is
    validated against the original date_from/strategy, not a replacement for
    them - omitting them on a follow-up request gets a 422
    WRONG_CONTINUATION_KEY, so every page resends the same values."""
    continuation_key = None
    while True:
        page = get_transactions(
            session_id, account_uid, date_from=date_from, strategy=strategy, continuation_key=continuation_key,
        )
        yield from page['transactions']
        continuation_key = page.get('continuation_key')
        if not continuation_key:
            break
