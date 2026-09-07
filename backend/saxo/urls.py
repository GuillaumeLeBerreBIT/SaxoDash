from django.urls import path

from .views import (
    SaxoCallbackView,
    SaxoConnectTicketView,
    SaxoConnectView,
    SaxoStatusView,
)

urlpatterns = [
    path('connect-ticket/', SaxoConnectTicketView.as_view(), name='saxo-connect-ticket'),
    path('connect/', SaxoConnectView.as_view(), name='saxo-connect'),
    path('callback/', SaxoCallbackView.as_view(), name='saxo-callback'),
    path('status/', SaxoStatusView.as_view(), name='saxo-status'),
]
