from django.urls import path

from .views import (
    InvestorChangesView, InvestorDetailView, InvestorHubView, InvestorListView, InvestorSearchView, InvestorStocksView,
)

urlpatterns = [
    path('', InvestorListView.as_view(), name='investor-list'),
    path('hub/', InvestorHubView.as_view(), name='investor-hub'),
    path('stocks/', InvestorStocksView.as_view(), name='investor-stocks'),
    path('search/', InvestorSearchView.as_view(), name='investor-search'),
    path('<slug:slug>/', InvestorDetailView.as_view(), name='investor-detail'),
    path('<slug:slug>/changes/', InvestorChangesView.as_view(), name='investor-changes'),
]
