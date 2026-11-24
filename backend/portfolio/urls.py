from django.urls import path
from .views import AccountHistoryView, PositionListView, PortfolioSummaryView, PortfolioInsightsView

urlpatterns = [
    path('positions/', PositionListView.as_view(), name='position-list'),
    path('summary/', PortfolioSummaryView.as_view(), name='portfolio-summary'),
    path('insights/', PortfolioInsightsView.as_view(), name='portfolio-insights'),
    path('account-history/', AccountHistoryView.as_view(), name='account-history'),
]
