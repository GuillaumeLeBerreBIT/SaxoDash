from django.urls import path

from .views import NetWorthHistoryView

urlpatterns = [
    path('net-worth-history/', NetWorthHistoryView.as_view(), name='net-worth-history'),
]
