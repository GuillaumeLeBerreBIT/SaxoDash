from django.urls import path
from .views import PositionListView, PortfolioSummaryView

urlpatterns = [
    path('positions/', PositionListView.as_view(), name='position-list'),
    path('summary/', PortfolioSummaryView.as_view(), name='portfolio-summary'),
]
