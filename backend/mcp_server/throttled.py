from types import SimpleNamespace

from research import daily, listings
from research.providers import ProviderError, ProviderNotConnected
from research.views import ChartView, InstrumentDetailsView, InstrumentSearchView

from .views import call_view, problem


def _data(result):
    message = problem(result)
    if result.status == 409:
        raise ProviderNotConnected(message)
    if message:
        raise ProviderError(message)
    return result.data


def _search(keywords, asset_types):
    return _data(call_view(InstrumentSearchView, query={'q': keywords, 'asset_types': asset_types}))


def _details(uic, asset_type):
    return _data(call_view(InstrumentDetailsView, kwargs={'uic': uic, 'asset_type': asset_type}))


def _chart(uic, asset_type, horizon, count):
    return _data(call_view(ChartView, query={'uic': uic, 'asset_type': asset_type, 'horizon': horizon, 'count': count}))


PAGES = SimpleNamespace(search=_search, details=_details, chart=_chart)


def look_up(symbol):
    return listings.look_up(symbol, PAGES)


def candles(listing):
    return daily.candles(listing, PAGES)


def bars(uic, asset_type):
    return daily.bars(uic, asset_type, PAGES)


def available(listing):
    return daily.available(listing, PAGES)
