from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from .filters import TransactionFilter
from .models import Transaction
from .serializers import CashFlowRowSerializer, TransactionSerializer
from .services import get_monthly_cash_flow


class TransactionListView(ListAPIView):
    queryset = Transaction.objects.all()
    filterset_class = TransactionFilter
    serializer_class = TransactionSerializer
    filter_backends = [DjangoFilterBackend]


class CashFlowView(APIView):

    def get(self, request):
        return Response(CashFlowRowSerializer(get_monthly_cash_flow(), many=True).data)
