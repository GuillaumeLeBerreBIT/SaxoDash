from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from investors.ownership import BadTickers, parse_tickers
from research.listings import bare

from . import payload, track_record
from .models import StockVerdict


class VerdictSummaryView(APIView):
    def get(self, request):
        try:
            tickers = parse_tickers(request.query_params.get('tickers'))
        except BadTickers as error:
            raise ValidationError({'tickers': str(error)})
        found = list(StockVerdict.objects.filter(ticker__in=tickers))
        computed = payload.for_user(found, request.user)
        return Response({'verdicts': {ticker: computed.get(ticker) for ticker in tickers}})


class VerdictDetailView(APIView):
    def get(self, request, ticker):
        verdict = StockVerdict.objects.filter(ticker=bare(ticker)).first()
        if verdict is None:
            return Response({'verdict': None})
        return Response({'verdict': payload.for_user([verdict], request.user, detailed=True)[verdict.ticker]})


class TrackRecordView(APIView):
    def get(self, request):
        return Response(track_record.report())
