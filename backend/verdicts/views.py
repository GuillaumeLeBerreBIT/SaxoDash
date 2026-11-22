from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from investors.ownership import BadTickers, parse_tickers
from research.listings import bare

from . import browse, payload, track_record, visibility
from .models import StockVerdict


class VerdictSummaryView(APIView):
    def get(self, request):
        try:
            tickers = parse_tickers(request.query_params.get('tickers'))
        except BadTickers as error:
            raise ValidationError({'tickers': str(error)})
        found = visibility.visible_to(list(StockVerdict.objects.filter(ticker__in=tickers)), request.user)
        computed = payload.for_user(found, request.user)
        return Response({'verdicts': {ticker: computed.get(ticker) for ticker in tickers}})


class VerdictDetailView(APIView):
    def get(self, request, ticker):
        found = visibility.visible_to(list(StockVerdict.objects.filter(ticker=bare(ticker))), request.user)
        if not found:
            return Response({'verdict': None})
        verdict = found[0]
        return Response({'verdict': payload.for_user([verdict], request.user, detailed=True)[verdict.ticker]})


class TrackRecordView(APIView):
    def get(self, request):
        return Response(track_record.report(user=request.user))


def _csv(params, name, allowed=None):
    values = {value.strip() for value in params.get(name, '').split(',') if value.strip()}
    if allowed is not None and not values <= set(allowed):
        raise ValidationError({name: f'Use any of {", ".join(allowed)}.'})
    return values


def _number(params, name, cast=float, low=None, high=None):
    raw = params.get(name)
    if raw in (None, ''):
        return None
    try:
        value = cast(raw)
    except ValueError:
        raise ValidationError({name: 'Must be a number.'})
    if (low is not None and value < low) or (high is not None and value > high):
        raise ValidationError({name: f'Must be between {low} and {high}.'})
    return value


class BrowseView(APIView):
    def get(self, request):
        params = request.query_params
        screen = params.get('screen', 'all')
        if screen not in browse.SCREENS:
            raise ValidationError({'screen': 'Unknown stock screen.'})
        sort = params.get('sort') or {'pullbacks': 'fall', 'fund-buying': 'funds'}.get(screen, 'opportunity')
        if sort not in browse.SORTS:
            raise ValidationError({'sort': f'Use one of {", ".join(browse.SORTS)}.'})
        query = browse.Query(
            screen=screen,
            valuation=_csv(params, 'valuation', browse.VALUATIONS),
            quality=_csv(params, 'quality', browse.QUALITIES),
            sector=_csv(params, 'sector'),
            min_yield=_number(params, 'min_yield', low=0, high=100),
            min_fall=_number(params, 'min_fall', low=0, high=100),
            not_held=params.get('not_held') in ('1', 'true'),
            exclude={ticker.upper() for ticker in _csv(params, 'exclude')},
            text=(params.get('q') or '').strip()[:60],
            only={ticker.upper() for ticker in _csv(params, 'tickers')},
            sort=sort,
            limit=_number(params, 'limit', int, 1, browse.MAX_LIMIT) or browse.DEFAULT_LIMIT,
            offset=_number(params, 'offset', int, 0, 10_000) or 0,
        )
        return Response(browse.run(query, request.user))
