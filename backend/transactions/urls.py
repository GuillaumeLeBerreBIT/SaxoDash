from django.urls import path
from .views import TransactionListView, CashFlowView

urlpatterns = [
    path('', TransactionListView.as_view(), name='transaction-list'),
    path('cash-flow/', CashFlowView.as_view(), name='cash-flow'),
]