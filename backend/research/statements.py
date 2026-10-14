from django.core.cache import cache

from . import finnhub
from .providers import ProviderUnavailable
from .statement_shaping import to_annual, to_quarterly


STATEMENTS_TTL = 86400
PARTIAL_TTL = 600
CACHE_V = 'v2'


def _cache_key(symbol):
    return f'research:statements:{CACHE_V}:{symbol}'


class NoStatements(ProviderUnavailable):
    def __init__(self, symbol):
        super().__init__(
            f'No annual reports are available for {symbol}. '
            'Statements cover companies that file a 10-K with the SEC.'
        )


def _produce(symbol):
    annual = finnhub.annual_statements(symbol)
    if not annual:
        raise NoStatements(symbol)
    try:
        quarterly = to_quarterly(finnhub.get_financials_reported(symbol, 'quarterly'), annual)
    except (ProviderUnavailable, KeyError, TypeError, IndexError, ValueError, AttributeError):
        return {'annual': annual, 'quarterly': [], 'partial': True}, PARTIAL_TTL
    return {'annual': annual, 'quarterly': quarterly, 'partial': False}, STATEMENTS_TTL


def statements(symbol):
    key = _cache_key(symbol)
    try:
        data = cache.get(key)
        if data is None:
            data, timeout = _produce(symbol)
            cache.set(key, data, timeout)
    except ProviderUnavailable:
        raise
    except (KeyError, TypeError, IndexError, ValueError, AttributeError) as exc:
        raise finnhub.FinnhubUnexpected() from exc

    return {'available': True, **data}
