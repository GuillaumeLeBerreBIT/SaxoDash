from django.urls import path

from .views import InvestorListView

urlpatterns = [
    path('', InvestorListView.as_view(), name='investor-list'),
]
