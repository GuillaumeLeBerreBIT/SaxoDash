from django.shortcuts import render
from rest_framework.generics import ListAPIView
from .models import Transaction
from .filters import TransactionFilter
from .serializers import TransactionSerializer
from django_filters.rest_framework import DjangoFilterBackend
# Create your views here.
class TransactionListView(ListAPIView):
    queryset = Transaction.objects.all()
    filterset_class = TransactionFilter
    serializer_class = TransactionSerializer
    filter_backends = [DjangoFilterBackend]