from . import finnhub
from .provider_cache import SHAPING_ERRORS, cached
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
    except (ProviderUnavailable, *SHAPING_ERRORS):
        return {'annual': annual, 'quarterly': [], 'partial': True}, PARTIAL_TTL
    return {'annual': annual, 'quarterly': quarterly, 'partial': False}, STATEMENTS_TTL


def statements(symbol):
    data = cached(_cache_key(symbol), lambda: _produce(symbol), unexpected=finnhub.FinnhubUnexpected)
    return {'available': True, **data}
