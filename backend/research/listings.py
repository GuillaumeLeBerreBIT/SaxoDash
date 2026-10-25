from dataclasses import asdict, dataclass

from django.core.cache import cache

from portfolio.models import Position

from . import company_data, market
from .providers import ProviderError

SEARCH_ASSET_TYPES = 'Stock,Etf'
CACHE_PREFIX = 'research:listing:v1:'
CACHE_TTL = 600


def bare(symbol):
    return symbol.split(':')[0].strip().upper()


@dataclass(frozen=True)
class Listing:
    ticker: str
    symbol: str | None
    name: str | None
    uic: int | None
    asset_type: str | None
    currency: str | None
    exchange: str | None

    @classmethod
    def unresolved(cls, ticker):
        return cls(ticker=ticker, symbol=None, name=None, uic=None, asset_type=None, currency=None, exchange=None)

    @property
    def resolved(self):
        return self.uic is not None

    @property
    def company_status(self):
        return company_data.status(asset_type=self.asset_type, currency=self.currency, resolved=self.resolved)

    def refusal(self, *, allow_fund=False):
        status = self.company_status
        if status == company_data.ELIGIBLE or (allow_fund and status == company_data.FUND):
            return None
        return company_data.refusal(status)

    @property
    def unverified_warning(self):
        if self.resolved:
            return None
        return f'{self.ticker} could not be matched to a Saxo listing, so it is assumed to be US-listed.'

    def as_dict(self):
        fields = asdict(self)
        fields.pop('ticker')
        return fields


def _held(ticker):
    position = Position.objects.filter(ticker__iexact=ticker, uic__isnull=False).order_by('id').first()
    if position is None or not position.asset_type:
        return None
    return Listing(
        ticker=ticker,
        symbol=position.ticker,
        name=position.name,
        uic=position.uic,
        asset_type=position.asset_type,
        currency=position.currency,
        exchange=None,
    )


def _details_currency(saxo, uic, asset_type):
    try:
        return saxo.details(uic, asset_type).get('currency') or None
    except ProviderError:
        return None


def _searched(ticker, saxo):
    try:
        rows = saxo.search(ticker, SEARCH_ASSET_TYPES)
    except ProviderError:
        return None
    matches = [row for row in rows if bare(row.get('symbol') or '') == ticker]
    if not matches:
        return None
    row = next((r for r in matches if r.get('currency') == company_data.COMPANY_DATA_CURRENCY), matches[0])
    currency = row.get('currency') or _details_currency(saxo, row['uic'], row['asset_type'])
    return Listing(
        ticker=ticker,
        symbol=row['symbol'],
        name=row.get('description') or row.get('name') or '',
        uic=row['uic'],
        asset_type=row['asset_type'],
        currency=currency or None,
        exchange=row.get('exchange') or None,
    )


def look_up(symbol, saxo=market):
    ticker = bare(symbol)
    held = _held(ticker)
    if held is not None:
        return held
    key = f'{CACHE_PREFIX}{ticker}'
    found = cache.get(key)
    if found is None:
        found = _searched(ticker, saxo)
        if found is not None:
            cache.set(key, found, CACHE_TTL)
    return found or Listing.unresolved(ticker)
