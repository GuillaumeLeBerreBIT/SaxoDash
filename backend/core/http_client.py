import requests

REQUEST_TIMEOUT = 10
ERROR_BODY_LIMIT = 200
TRANSIENT_STATUSES = frozenset({408, 425, 429, 500, 502, 503, 504})


def request_json(send, url, label, *, transient, permanent, **kwargs):
    try:
        response = send(url, timeout=REQUEST_TIMEOUT, **kwargs)
    except requests.RequestException as exc:
        raise transient(f'{label} failed: {exc}') from exc

    if not response.ok:
        error = transient if response.status_code in TRANSIENT_STATUSES else permanent
        raise error(f'{label} failed: {response.status_code} {response.text[:ERROR_BODY_LIMIT]}')

    try:
        return response.json()
    except ValueError as exc:
        raise permanent(f'{label} returned a non-JSON body') from exc
