from django.urls import path

from .views import PerformanceView, RiskMetricsView

urlpatterns = [
    path('risk/', RiskMetricsView.as_view(), name='risk-metrics'),
    path('performance/', PerformanceView.as_view(), name='performance'),
]
