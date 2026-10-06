from django.urls import path

from .views import InvestorDetailView, InvestorListView

urlpatterns = [
    path('', InvestorListView.as_view(), name='investor-list'),
    path('<slug:slug>/', InvestorDetailView.as_view(), name='investor-detail'),
]
