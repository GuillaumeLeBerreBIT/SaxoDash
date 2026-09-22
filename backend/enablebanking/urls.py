from django.urls import path

from .views import (
    BankTransactionCategoryView,
    BankTransactionListView,
    BudgetListView,
    BudgetProgressView,
    EnableBankingCallbackView,
    EnableBankingConnectTicketView,
    EnableBankingConnectView,
    EnableBankingStatusView,
    LabeledAccountCandidatesView,
    LabeledAccountDetailView,
    LabeledAccountListCreateView,
    SpendingSummaryView,
    SpendingTrendView,
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
    path('spending/trend/', SpendingTrendView.as_view(), name='enablebanking-spending-trend'),
    path('subscriptions/', SubscriptionListView.as_view(), name='enablebanking-subscriptions'),
    path('subscriptions/<int:pk>/', SubscriptionDetailView.as_view(), name='enablebanking-subscription-detail'),
    path('budgets/', BudgetListView.as_view(), name='enablebanking-budgets'),
    path('budgets/progress/', BudgetProgressView.as_view(), name='enablebanking-budget-progress'),
    path('labeled-accounts/', LabeledAccountListCreateView.as_view(), name='enablebanking-labeled-accounts'),
    path('labeled-accounts/candidates/', LabeledAccountCandidatesView.as_view(), name='enablebanking-labeled-account-candidates'),
    path('labeled-accounts/<int:pk>/', LabeledAccountDetailView.as_view(), name='enablebanking-labeled-account-detail'),
]
