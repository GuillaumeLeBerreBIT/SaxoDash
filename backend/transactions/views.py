from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.generics import ListAPIView

from .filters import TransactionFilter
from .models import Transaction
from .serializers import TransactionSerializer


class TransactionListView(ListAPIView):
    queryset = Transaction.objects.all()
    filterset_class = TransactionFilter
    serializer_class = TransactionSerializer
    filter_backends = [DjangoFilterBackend]
