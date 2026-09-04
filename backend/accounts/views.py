from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from core.services import current_net_worth

from .models import BankAccount
from .serializers import BankAccountSerializer


class BankAccountListView(ListAPIView):
    queryset = BankAccount.objects.all()
    serializer_class = BankAccountSerializer
    pagination_class = None


class NetWorthView(APIView):

    def get(self, request):
        net_worth = current_net_worth()
        return Response({
            'portfolio_value': net_worth.portfolio.rounded().amount,
            'bank_total': net_worth.bank.rounded().amount,
            'net_worth': net_worth.total.rounded().amount,
        })
