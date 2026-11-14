from rest_framework.response import Response
from rest_framework.views import APIView

from research.listings import bare
from verdicts import visibility

from . import definitions
from .models import SignalScore, StockSignals

HORIZON_FIELDS = (
    'cases', 'stocks', 'mean_excess', 'ci_low', 'ci_high', 'positive_share', 'first_half', 'second_half',
)


def _catalogue():
    by_key = {}
    for score in SignalScore.objects.all():
        by_key.setdefault(score.key, []).append(score)
    signals = []
    for signal in definitions.SIGNALS:
        scores = by_key.get(signal.key, [])
        dated = [score for score in scores if score.from_date and score.to_date]
        signals.append({
            'key': signal.key, 'code': signal.code, 'label': signal.label,
            'description': signal.description, 'kind': signal.kind,
            'grade': scores[0].grade if scores else None,
            'period': {
                'from': min(score.from_date for score in dated),
                'to': max(score.to_date for score in dated),
            } if dated else None,
            'horizons': {
                str(score.horizon): {name: getattr(score, name) for name in HORIZON_FIELDS} for score in scores
            },
        })
    return signals


class SignalListView(APIView):
    def get(self, request):
        return Response({'signals': _catalogue()})


class StockSignalsView(APIView):
    def get(self, request, ticker):
        found = StockSignals.objects.filter(ticker=bare(ticker)).first()
        if found is None or found.ticker not in visibility.visible_tickers([found.ticker], request.user):
            return Response({'stock_signals': None})
        return Response({'stock_signals': {
            'ticker': found.ticker, 'uic': found.uic, 'as_of': found.as_of,
            'active': found.active, 'events': found.events,
        }})
