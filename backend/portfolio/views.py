from django.shortcuts import render
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Position
from .serializers import PositionSerializer
from .services import get_positions_total_value
from decimal import Decimal

# Create your views here.
class PositionListView(ListAPIView):
    queryset = Position.objects.all()
    serializer_class = PositionSerializer
    pagination_class = None
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['total_value'] = get_positions_total_value()
        return context

class PortfolioSummaryView(APIView):
    
    def get(self, request):
        positions = Position.objects.all()
        total_value = get_positions_total_value()
        
        total_cost = sum(
            (p.qty * p.avg_cost for p in positions), Decimal('0')
        )
        total_pnl = total_value - total_cost
        total_pnl_pct = (
            (total_pnl / total_cost) * 100 if total_cost else Decimal('0')
        )
        
        allocation = [
            {'ticker': p.ticker, 'value': p.qty * p.current_price, 'color': p.color} 
            for p in positions
        ]
        
        return Response({
            'total_value': total_value,
            'total_cost': total_cost,
            'total_pnl': total_pnl,
            'total_pnl_pct': total_pnl_pct,
            'allocation': allocation,
        })