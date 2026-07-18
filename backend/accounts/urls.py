
from django.urls import path, include
from .views import BankAccountListView, NetWorthView

urlpatterns = [
    path('', BankAccountListView.as_view(), name=('acount-list')),
    path('net-worth/', NetWorthView.as_view(), name=('net-worth')),
]