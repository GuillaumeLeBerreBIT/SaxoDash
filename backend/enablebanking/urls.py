from django.urls import path

from .views import (
    BankTransactionCategoryView,
    BankTransactionListView,
    EnableBankingCallbackView,
    EnableBankingConnectTicketView,
    EnableBankingConnectView,
    EnableBankingStatusView,
    SpendingSummaryView,
    SubscriptionDetailView,
    SubscriptionListView,
)

urlpatterns = [
    path('connect-ticket/', EnableBankingConnectTicketView.as_view(), name='enablebanking-connect-ticket'),
    path('connect/<str:bank>/', EnableBankingConnectView.as_view(), name='enablebanking-connect'),
    path('callback/', EnableBankingCallbackView.as_view(), name='enablebanking-callback'),
    path('status/', EnableBankingStatusView.as_view(), name='enablebanking-status'),
    path('transactions/', BankTransactionListView.as_view(), name='enablebanking-transactions'),
    path('transactions/<int:pk>/category/', BankTransactionCategoryView.as_view(), name='enablebanking-transaction-category'),
    path('spending/summary/', SpendingSummaryView.as_view(), name='enablebanking-spending-summary'),
    path('subscriptions/', SubscriptionListView.as_view(), name='enablebanking-subscriptions'),
    path('subscriptions/<int:pk>/', SubscriptionDetailView.as_view(), name='enablebanking-subscription-detail'),
]
