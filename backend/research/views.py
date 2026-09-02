import logging

from django.shortcuts import get_object_or_404
from rest_framework import status
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
from saxo.credentials import SaxoNotConnected

from . import market
from .models import Watchlist, WatchlistItem
from .serializers import (
    WatchlistItemCreateSerializer,
    WatchlistSerializer,
)

logger = logging.getLogger(__name__)

# Saxo's Horizon is in minutes. v1 charts daily bars only; the intraday
# horizons are listed so the validation does not have to change to allow them.
ALLOWED_HORIZONS = {1, 5, 10, 15, 30, 60, 120, 240, 360, 480, 720, 1440, 10080, 43200}


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


def _market_response(produce):
    """Run one market.py call and map its failures onto HTTP.

    409 rather than 401 for a missing credential: the user is authenticated,
    it is the app's Saxo connection that is absent, and the frontend needs to
    tell those apart to show the reconnect prompt.
    """
    try:
        return Response(produce())
    except SaxoNotConnected as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
    except client.SaxoAPIError:
        logger.warning('Saxo market-data request failed', exc_info=True)
        return Response(
            {'detail': 'Saxo could not serve this request.'},
            status=status.HTTP_502_BAD_GATEWAY,
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


class ChartView(APIView):
    def get(self, request):
        horizon = _int_param(request.query_params, 'horizon', 1440)
        if horizon not in ALLOWED_HORIZONS:
            raise ValidationError({'horizon': 'Not a Saxo chart horizon.'})

        uic = _int_param(request.query_params, 'uic')
        asset_type = _asset_type(request.query_params)
        count = _int_param(request.query_params, 'count', client.CHART_MAX_COUNT)

        return _market_response(lambda: market.chart(uic, asset_type, horizon, count))


class InstrumentSearchView(APIView):
    def get(self, request):
        keywords = request.query_params.get('q', '').strip()
        if len(keywords) < 2:
            return Response([])

        asset_types = request.query_params.get('asset_types', 'Stock,Etf')
        return _market_response(lambda: market.search(keywords, asset_types))


class InstrumentDetailsView(APIView):
    def get(self, request, uic, asset_type):
        return _market_response(lambda: market.details(int(uic), asset_type))


class QuotesView(APIView):
    def get(self, request):
        raw = request.query_params.get('uics', '')
        try:
            uics = [int(part) for part in raw.split(',') if part.strip()]
        except ValueError:
            raise ValidationError({'uics': 'Must be a comma-separated list of integers.'})

        if not uics:
            return Response([])

        asset_type = _asset_type(request.query_params)
        return _market_response(lambda: market.quotes(uics, asset_type))
