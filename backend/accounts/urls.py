from django.urls import path
from .views import BankAccountListView, NetWorthView

urlpatterns = [
    path('', BankAccountListView.as_view(), name='account-list'),
    path('net-worth/', NetWorthView.as_view(), name='net-worth'),
]