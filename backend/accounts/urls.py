from django.urls import path
from .views import NetWorthView

urlpatterns = [
    path('net-worth/', NetWorthView.as_view(), name='net-worth'),
]