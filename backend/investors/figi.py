import time

import requests
from django.conf import settings

from core.http_client import request_json

MAPPING_URL = 'https://api.openfigi.com/v3/mapping'
KEYLESS_LIMITS = (10, 2.5)
KEYED_LIMITS = (100, 0.25)
US_COMPOSITE = 'US'


class FigiError(Exception):
    pass


def batch_limits():
    return KEYED_LIMITS if settings.OPENFIGI_API_KEY else KEYLESS_LIMITS


def _headers():
    headers = {'Content-Type': 'application/json'}
    if settings.OPENFIGI_API_KEY:
        headers['X-OPENFIGI-APIKEY'] = settings.OPENFIGI_API_KEY
    return headers


def _shape(result):
    listing = next((item for item in result.get('data') or [] if item.get('exchCode') == US_COMPOSITE), None)
    if listing is None or not listing.get('ticker'):
        return None
    return {
        'ticker': listing['ticker'].replace('/', '.'),
        'name': listing.get('name') or '',
        'figi': listing.get('figi') or '',
        'security_type': listing.get('securityType') or '',
    }


def resolve(cusips):
    size, spacing = batch_limits()
    cusips = list(cusips)
    for start in range(0, len(cusips), size):
        if start:
            time.sleep(spacing)
        batch = cusips[start:start + size]
        results = request_json(
            requests.post, MAPPING_URL, 'OpenFIGI mapping',
            transient=FigiError, permanent=FigiError,
            json=[{'idType': 'ID_CUSIP', 'idValue': cusip} for cusip in batch],
            headers=_headers(),
        )
        if not isinstance(results, list) or len(results) != len(batch):
            raise FigiError('OpenFIGI mapping returned an unexpected body')
        yield {cusip: _shape(result) for cusip, result in zip(batch, results)}
