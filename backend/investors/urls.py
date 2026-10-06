from django.urls import path

from .views import InvestorChangesView, InvestorDetailView, InvestorListView

urlpatterns = [
    path('', InvestorListView.as_view(), name='investor-list'),
    path('<slug:slug>/', InvestorDetailView.as_view(), name='investor-detail'),
    path('<slug:slug>/changes/', InvestorChangesView.as_view(), name='investor-changes'),
]
