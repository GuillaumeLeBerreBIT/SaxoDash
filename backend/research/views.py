import re

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.generics import (
    CreateAPIView,
    DestroyAPIView,
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
)
from rest_framework.response import Response
from rest_framework.views import APIView

from saxo import client

from . import earnings, finnhub, market
from .models import Watchlist, WatchlistItem
from .providers import provider_response
from .serializers import (
    WatchlistItemCreateSerializer,
    WatchlistSerializer,
)

# Saxo's Horizon is in minutes. Daily and coarser only: `market.to_candle`
# identifies a bar by its date, so an intraday horizon would collapse a whole
# session onto one key - the sort becomes a no-op, the chart draws backwards
# and React sees duplicate keys. Admitting one means changing that identity.
ALLOWED_HORIZONS = {1440, 10080, 43200}


class WatchlistListCreateView(ListCreateAPIView):
    queryset = Watchlist.objects.prefetch_related('items')
    serializer_class = WatchlistSerializer
    pagination_class = None


class WatchlistDetailView(RetrieveUpdateDestroyAPIView):
    queryset = Watchlist.objects.prefetch_related('items')
    serializer_class = WatchlistSerializer


class WatchlistItemCreateView(CreateAPIView):
    serializer_class = WatchlistItemCreateSerializer

    def get_serializer_context(self):
        return {
            **super().get_serializer_context(),
            'watchlist': get_object_or_404(Watchlist, pk=self.kwargs['pk']),
        }


class WatchlistItemDeleteView(DestroyAPIView):
    def get_object(self):
        return get_object_or_404(
            WatchlistItem, pk=self.kwargs['item_pk'], watchlist_id=self.kwargs['pk']
        )


def _int_param(params, name, default=None):
    raw = params.get(name, default)
    if raw is None or raw == '':
        raise ValidationError({name: 'This query parameter is required.'})
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ValidationError({name: 'Must be an integer.'})


def _asset_type(params):
    asset_type = params.get('asset_type', '').strip()
    if not asset_type:
        raise ValidationError({'asset_type': 'This query parameter is required.'})
    return asset_type


SYMBOL_PATTERN = re.compile(r'^[A-Za-z0-9.\-]{1,12}$')


def _symbol(raw):
    if not SYMBOL_PATTERN.match(raw):
        raise ValidationError({'symbol': 'Not a valid ticker symbol.'})
    return raw.upper()


class ChartView(APIView):
    throttle_scope = 'research.market'

    def get(self, request):
        horizon = _int_param(request.query_params, 'horizon', 1440)
        if horizon not in ALLOWED_HORIZONS:
            raise ValidationError({'horizon': 'Not a Saxo chart horizon.'})

        uic = _int_param(request.query_params, 'uic')
        asset_type = _asset_type(request.query_params)
        count = _int_param(request.query_params, 'count', client.CHART_MAX_COUNT)

        return provider_response(lambda: market.chart(uic, asset_type, horizon, count))


class InstrumentSearchView(APIView):
    throttle_scope = 'research.search'

    def get(self, request):
        keywords = request.query_params.get('q', '').strip()
        if len(keywords) < 2:
            return Response([])

        asset_types = request.query_params.get('asset_types', 'Stock,Etf')
        return provider_response(lambda: market.search(keywords, asset_types))


class InstrumentDetailsView(APIView):
    throttle_scope = 'research.market'

    def get(self, request, uic, asset_type):
        return provider_response(lambda: market.details(int(uic), asset_type))


class QuotesView(APIView):
    throttle_scope = 'research.market'

    def get(self, request):
        raw = request.query_params.get('uics', '')
        try:
            uics = [int(part) for part in raw.split(',') if part.strip()]
        except ValueError:
            raise ValidationError({'uics': 'Must be a comma-separated list of integers.'})

        if not uics:
            return Response([])

        asset_type = _asset_type(request.query_params)
        return provider_response(lambda: market.quotes(uics, asset_type))


class FundamentalsView(APIView):
    throttle_scope = 'research.fundamentals'

    def get(self, request, symbol):
        symbol = _symbol(symbol)
        return provider_response(lambda: finnhub.fundamentals(symbol))


class EarningsCalendarView(APIView):
    throttle_scope = 'research.earnings'

    def get(self, request):
        return Response(earnings.upcoming_earnings(earnings.tracked_symbols()))


class SymbolEarningsView(APIView):
    throttle_scope = 'research.earnings'

    def get(self, request, symbol):
        symbol = _symbol(symbol)
        return provider_response(lambda: earnings.symbol_earnings(symbol))
