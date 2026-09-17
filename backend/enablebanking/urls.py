from django.urls import path

from .views import (
    EnableBankingCallbackView,
    EnableBankingConnectTicketView,
    EnableBankingConnectView,
    EnableBankingStatusView,
)

urlpatterns = [
    path('connect-ticket/', EnableBankingConnectTicketView.as_view(), name='enablebanking-connect-ticket'),
    path('connect/<str:bank>/', EnableBankingConnectView.as_view(), name='enablebanking-connect'),
    path('callback/', EnableBankingCallbackView.as_view(), name='enablebanking-callback'),
    path('status/', EnableBankingStatusView.as_view(), name='enablebanking-status'),
]
