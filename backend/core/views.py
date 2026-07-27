from django.shortcuts import render
from datetime import timedelta
from django.utils import timezone
from rest_framework.views import APIView, Response

from .models import NetWorthSnapshot
from .serializers import NetWorthSnapshotSerializer
from .services import ensure_todays_snapshot
# Create your views here.

RANGE_DAYS = {'1M': 30, '3M': 91, '6M': 182, '1Y': 365}

class NetWorthHistoryView(APIView):
    
    def get(self, request):
        
        ensure_todays_snapshot()
        range_param = request.query_params.get('range', 'ALL')
        queryset = NetWorthSnapshot.objects.all()
        
        days = RANGE_DAYS.get(range_param)
        if days is not None:
            cutoff = timezone.localdate() - timedelta(days=days)
            queryset = queryset.filter(date__gte=cutoff)
        
        serializer = NetWorthSnapshotSerializer(queryset, many=True)
        
        return Response(serializer.data)