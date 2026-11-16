from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from investors.ownership import BadTickers, parse_tickers
from research.listings import bare
from research.models import ScreenerRow

from . import payload, track_record, visibility
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


WORTH_A_LOOK_LIMIT = 12


def _discount_pct(verdict):
    return round((1 - verdict.last_close / verdict.cheap_below) * 100, 1)


class WorthALookView(APIView):
    def get(self, request):
        universe = ScreenerRow.objects.values_list('ticker', flat=True)
        found = [
            verdict
            for verdict in StockVerdict.objects.filter(quality='strong', valuation='cheap', ticker__in=universe)
            if verdict.last_close and verdict.cheap_below
        ]
        found.sort(key=lambda verdict: (-_discount_pct(verdict), verdict.ticker))
        shown = found[:WORTH_A_LOOK_LIMIT]
        computed = payload.for_user(shown, request.user)
        return Response({
            'total': len(found),
            'stocks': [
                {
                    **computed[verdict.ticker],
                    'ticker': verdict.ticker,
                    'name': verdict.name,
                    'last_close': verdict.last_close,
                    'cheap_below': verdict.cheap_below,
                    'discount_pct': _discount_pct(verdict),
                }
                for verdict in shown
            ],
        })
