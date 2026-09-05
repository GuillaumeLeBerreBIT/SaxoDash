from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import NetWorthSnapshot

from . import metrics


class RiskMetricsView(APIView):

    def get(self, request):
        dated_values = list(
            NetWorthSnapshot.objects.order_by('date').values_list('date', 'portfolio_value')
        )
        summary = metrics.risk_summary(dated_values, settings.RISK_FREE_RATE_ANNUAL)
        return Response(summary)
