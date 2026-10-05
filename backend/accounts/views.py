from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from core.money import CurrencyMismatch
from core.services import current_net_worth

from .models import BankAccount
from .serializers import BankAccountSerializer
from .services import get_bank_only_balance, get_broker_cash_balance


class BankAccountListView(ListAPIView):
    queryset = BankAccount.objects.all()
    serializer_class = BankAccountSerializer
    pagination_class = None


class NetWorthView(APIView):

    def get(self, request):
        # Refusing to add USD to EUR is deliberate, but it is the user's
        # problem to fix, not a server error: name the account and the currency
        # instead of a 500 they cannot act on.
        try:
            net_worth = current_net_worth()
            bank_only = get_bank_only_balance()
            broker_cash = get_broker_cash_balance()
        except CurrencyMismatch as exc:
            return Response(
                {'detail': f'Cannot total your accounts: {exc}'},
                status=status.HTTP_409_CONFLICT,
            )

        return Response({
            'portfolio_value': net_worth.portfolio.rounded().amount,
            'bank_total': net_worth.bank.rounded().amount,
            'bank_only_total': bank_only.rounded().amount,
            'broker_cash': broker_cash.rounded().amount,
            'net_worth': net_worth.total.rounded().amount,
        })
