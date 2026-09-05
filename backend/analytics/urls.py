from django.urls import path

from .views import RiskMetricsView

urlpatterns = [
    path('risk/', RiskMetricsView.as_view(), name='risk-metrics'),
]
