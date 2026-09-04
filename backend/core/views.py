import logging
from datetime import timedelta

from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import NetWorthSnapshot
from .money import CurrencyMismatch
from .serializers import NetWorthSnapshotSerializer
from .services import ensure_todays_snapshot

logger = logging.getLogger(__name__)

RANGE_DAYS = {'1M': 30, '3M': 91, '6M': 182, '1Y': 365}


class NetWorthHistoryView(APIView):

    def get(self, request):
        # History is recorded fact and does not depend on today's total being
        # computable; a currency we cannot sum must not take the chart down too.
        try:
            ensure_todays_snapshot()
        except CurrencyMismatch:
            logger.warning('Could not record today\'s snapshot', exc_info=True)

        queryset = NetWorthSnapshot.objects.all()
        days = RANGE_DAYS.get(request.query_params.get('range', 'ALL'))
        if days is not None:
            queryset = queryset.filter(date__gte=timezone.localdate() - timedelta(days=days))

        return Response(NetWorthSnapshotSerializer(queryset, many=True).data)
