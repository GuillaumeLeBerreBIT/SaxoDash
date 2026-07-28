from django.shortcuts import render
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView, Response
from .models import Transaction
from .filters import TransactionFilter
from .serializers import TransactionSerializer, CashFlowRowSerializer
from .services import get_monthly_cash_flow
from django_filters.rest_framework import DjangoFilterBackend
# Create your views here.
class TransactionListView(ListAPIView):
    queryset = Transaction.objects.all()
    filterset_class = TransactionFilter
    serializer_class = TransactionSerializer
    filter_backends = [DjangoFilterBackend]


class CashFlowView(APIView):

    def get(self, request):
        serializer = CashFlowRowSerializer(get_monthly_cash_flow(), many=True)
        return Response(serializer.data)