"""Read-only company fundamentals from Finnhub, shaped and cached the same
way market.py does for Saxo - call, shape, cache. Finnhub needs a static API
key, not a per-user OAuth token, so there is no credential lookup here.
"""

import requests
from django.conf import settings

API_BASE = 'https://finnhub.io/api/v1'
REQUEST_TIMEOUT = 10
ERROR_BODY_LIMIT = 200


class FinnhubNotConfigured(Exception):
    """Raised when FINNHUB_API_KEY is not set."""


class FinnhubAPIError(Exception):
    """Raised when a Finnhub request fails."""


def _get(path, **params):
    if not settings.FINNHUB_API_KEY:
        raise FinnhubNotConfigured('FINNHUB_API_KEY is not set.')

    try:
        response = requests.get(
            f'{API_BASE}{path}',
            params={**params, 'token': settings.FINNHUB_API_KEY},
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise FinnhubAPIError(f'{path} failed: {exc}') from exc

    if not response.ok:
        body = response.text[:ERROR_BODY_LIMIT]
        raise FinnhubAPIError(f'{path} failed: {response.status_code} {body}')

    return response.json()
