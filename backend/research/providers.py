"""One seam from a data-provider call to an HTTP response.

`market.py` (Saxo) and `finnhub.py` translate their own failures into
`ProviderError` subclasses at their own boundary, so `provider_response` has a
single branch and this module imports neither `saxo` nor `requests`. Finnhub's
contract - always 200 with an `available` flag, never a status code, because
409 already means "not connected to Saxo" - is `ProviderUnavailable`.
"""
import logging

from rest_framework import status
from rest_framework.response import Response

logger = logging.getLogger(__name__)


class ProviderError(Exception):
    """A data-provider call failed in a way the caller cannot fix.

    Rendered as 502 and logged. A subclass overrides `http_status` / `log` /
    `body` for anything the caller can actually act on.
    """

    http_status = status.HTTP_502_BAD_GATEWAY
    log = True
    log_level = logging.WARNING

    def body(self):
        return {'detail': 'The data provider could not serve this request.'}


class ProviderNotConnected(ProviderError):
    """The app has no usable Saxo credential - a reconnect prompt, not an error.

    409, not 401: the user is authenticated; it is the app's Saxo link that is
    absent, and the frontend tells those apart.
    """

    http_status = status.HTTP_409_CONFLICT
    log = False

    def __init__(self, detail='The app is not connected to Saxo.'):
        super().__init__(detail)

    def body(self):
        return {'detail': str(self)}


class ProviderUnavailable(ProviderError):
    """The provider is reachable but has nothing to give for this request -
    an unknown symbol, a missing API key, or a payload we could not read.

    Rendered as 200 + `available: false` so the frontend shows the reason
    rather than an error page.
    """

    http_status = status.HTTP_200_OK
    log = False

    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason

    def body(self):
        return {'available': False, 'reason': self.reason}


def provider_response(produce):
    """Call `produce()` and turn any `ProviderError` into a `Response`."""
    try:
        return Response(produce())
    except ProviderError as exc:
        if exc.log:
            logger.log(exc.log_level, 'Provider request failed', exc_info=True)
        return Response(exc.body(), status=exc.http_status)
