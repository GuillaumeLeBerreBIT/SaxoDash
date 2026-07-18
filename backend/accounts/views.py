from django.shortcuts import render
from portfolio.services import get_positions_total_value
from .services import get_total_bank_balance
from .models import BankAccount
from .serializers import BankAccountSerializer
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView, Response
# Create your views here.

class BankAccountListView(ListAPIView):
    queryset=BankAccount.objects.all()
    serializer_class= BankAccountSerializer
    pagination_class=None
    
class NetWorthView(APIView):
    
    def get(self, request):
        portfolio_value = get_positions_total_value()
        bank_total = get_total_bank_balance()
        return Response({
            'portfolio_value': portfolio_value,
            'bank_total': bank_total,
            'net_worth': portfolio_value + bank_total
        })
    
