from django.urls import path

from .views import (
    InvestorAlertsReadView, InvestorAlertsView, InvestorChangesView, InvestorCopyView, InvestorDetailView,
    InvestorHubView,
    InvestorListView, InvestorSearchView, InvestorStocksView,
)

urlpatterns = [
    path('', InvestorListView.as_view(), name='investor-list'),
    path('hub/', InvestorHubView.as_view(), name='investor-hub'),
    path('stocks/', InvestorStocksView.as_view(), name='investor-stocks'),
    path('search/', InvestorSearchView.as_view(), name='investor-search'),
    path('alerts/', InvestorAlertsView.as_view(), name='investor-alerts'),
    path('alerts/read/', InvestorAlertsReadView.as_view(), name='investor-alerts-read'),
    path('<slug:slug>/', InvestorDetailView.as_view(), name='investor-detail'),
    path('<slug:slug>/changes/', InvestorChangesView.as_view(), name='investor-changes'),
    path('<slug:slug>/copy/', InvestorCopyView.as_view(), name='investor-copy'),
]
